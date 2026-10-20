/** Explicit, bounded live validation through the already configured local service. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../server/config.js';
import type { Conversation, ConversationPage, Project, Run, Snapshot } from '../shared/contracts.js';
import type { PluginOperation, PluginSnapshot } from '../shared/plugins.js';

if(process.env.PLUGIN_LIVE_QA!=='1') throw new Error('Requires PLUGIN_LIVE_QA=1; maximum three model requests');
const base='http://127.0.0.1:4310';
const evidence=resolve(process.env.PLUGIN_QA_ROOT||'output/dev-evidence/plugins/live');mkdirSync(evidence,{recursive:true});
const source=mkdtempSync(join(tmpdir(),'workbench-plugin-live-'));
const token='PLUGIN_'+randomUUID();const receipt=join(evidence,'tool-receipt.json');
writeFileSync(join(source,'package.json'),JSON.stringify({name:'workbench-live-probe',version:'1.0.0',pi:{extensions:['probe.mjs']}}));
writeFileSync(join(source,'probe.mjs'),`import {writeFileSync} from 'node:fs';export default pi=>pi.registerTool({name:'workbench_plugin_probe',label:'Plugin verification',description:'Return the verification marker for the current plugin acceptance test.',parameters:{type:'object',properties:{}},execute:async()=>{const marker=${JSON.stringify(token)};writeFileSync(${JSON.stringify(receipt)},JSON.stringify({marker,at:new Date().toISOString()}));return {content:[{type:'text',text:marker}],details:{verified:true}}}});`);
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:config.password})});
assert(login.ok,'Existing local authentication must succeed');const cookie=login.headers.get('set-cookie')!.split(';')[0];
async function api<T>(path:string,data?:unknown,method='POST'):Promise<T>{
  const response=await fetch(base+'/api'+path,{method:data===undefined?'GET':method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  if(!response.ok)throw new Error(`Local validation API ${path}: ${response.status}`);return response.json();
}
let project:Project|undefined;let packageId:string|undefined;const runs:Run[]=[];let passed=false;let failure:string|undefined;
async function operation(action:'install'|'remove'){
  const snapshot=await api<PluginSnapshot>('/plugins');
  const op=await api<PluginOperation>('/plugins/operations',{action,source,trusted:action==='install',revision:snapshot.configuration.revision,commandId:randomUUID()});
  const deadline=Date.now()+45000;
  while(Date.now()<deadline){const current=(await api<PluginSnapshot>('/plugins')).operations.find(o=>o.id===op.id)!;if(current.phase==='completed')return; if(['failed','reconcile_required'].includes(current.phase))throw new Error('Plugin validation operation failed: '+current.phase);await delay(200);}
  throw new Error('Plugin validation operation observation timed out; do not replay automatically');
}
async function execute(goal:string,maxCalls:number){
  const conversation=await api<Conversation>('/conversations',{projectId:project!.id,title:'插件验证 '+(runs.length+1),commandId:randomUUID()});
  const submitted=await api<{run:Run}>('/tasks',{projectId:project!.id,conversationId:conversation.id,goal,commandId:randomUUID(),mode:'pi',maxCalls,timeoutMs:90000});
  runs.push(submitted.run);const deadline=Date.now()+100000;
  while(Date.now()<deadline){const run=(await api<Snapshot>('/snapshot')).runs.find(r=>r.id===submitted.run.id)!;runs[runs.length-1]=run;if(!['queued','running','waiting_user','waiting_node'].includes(run.status)){assert.equal(run.status,'completed',run.error||'live run failed');return {run,history:await api<ConversationPage>(`/conversations/${conversation.id}/messages`)};}await delay(500);}
  throw new Error('Live task observation timed out');
}
try {
  const initial=await api<Snapshot>('/snapshot');assert(initial.config.modelConfigured&&initial.config.callsRemaining>=3,'Requires ready model and three authorized requests');
  assert(!initial.runs.some(r=>['queued','running','waiting_user','waiting_node'].includes(r.status)),'User work is active');
  const initialPlugins=await api<PluginSnapshot>('/plugins');assert.equal(initialPlugins.configuration.packages.length,0,'Live probe requires no pre-existing package configuration');
  await operation('install');let plugins=await api<PluginSnapshot>('/plugins');packageId=plugins.configuration.packages.find(p=>p.source===source)!.id;
  assert.equal(plugins.configuration.packages[0].enabled,false);
  await api(`/plugins/${packageId}`,{revision:plugins.configuration.revision,enabled:true},'PATCH');
  project=await api<Project>('/projects',{name:'插件管理在线验收 '+new Date().toISOString(),description:'自编插件真实工具往返，最多两任务三次模型请求；验收后归档。'});
  const enabled=await execute('这是插件管理验收。只调用一次 workbench_plugin_probe 工具，不调用其他工具，然后原样回复该工具返回的完整标记。',2);
  assert(enabled.run.calls>0&&enabled.run.calls<=2);assert(enabled.run.pluginTools?.some(t=>t.name==='workbench_plugin_probe'));
  assert(existsSync(receipt));assert.equal(JSON.parse(readFileSync(receipt,'utf8')).marker,token);
  assert(enabled.history.messages.some(m=>m.role==='assistant'&&m.text.includes(token)),'Model must return actual plugin output');
  plugins=await api<PluginSnapshot>('/plugins');await api(`/plugins/${packageId}`,{revision:plugins.configuration.revision,enabled:false},'PATCH');
  const disabled=await execute('不要调用任何工具，只回复 PLUGIN_DISABLED_OK。',1);
  assert.equal(disabled.run.pluginManifest?.packages.length,0);assert(!disabled.run.pluginTools?.some(t=>t.name==='workbench_plugin_probe'));
  assert(disabled.history.messages.some(m=>m.role==='assistant'&&m.text.includes('PLUGIN_DISABLED_OK')));
  await operation('remove');packageId=undefined;assert.equal((await api<PluginSnapshot>('/plugins')).configuration.packages.length,0);
  passed=true;
}catch(error){failure=String(error);process.exitCode=1;}
finally{
  if(project){
    const snapshot=await api<Snapshot>('/snapshot').catch(()=>undefined);
    for(const run of snapshot?.runs.filter(r=>r.projectId===project!.id)||[]){const index=runs.findIndex(r=>r.id===run.id);if(index>=0)runs[index]=run;if(['queued','running','waiting_user','waiting_node'].includes(run.status))await api(`/runs/${run.id}/cancel`,{}).catch(()=>{});}
    await api('/projects/update',{id:project.id,revision:project.revision,archived:true}).catch(()=>{});
  }
  if(packageId)try{await operation('remove');packageId=undefined;}catch{passed=false;failure=(failure||'')+'; probe package cleanup requires review';}
  await api('/logout',{}).catch(()=>{});
  const report={status:passed?'passed':'failed',failure,at:new Date().toISOString(),source,packageRemaining:packageId,projectId:project?.id,runIds:runs.map(r=>r.id),modelRequests:runs.reduce((sum,r)=>sum+r.calls,0),usage:runs.map(r=>r.usage),checks:passed?['local install defaults disabled','real model invokes plugin and returns tool marker','disabled fresh run excludes plugin','uninstall removes declaration']:[]};
  writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!passed)process.exitCode=1;
}

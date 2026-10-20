import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../server/app.js';
import {config} from '../server/config.js';
import {inspectPlugin} from '../server/plugin-packages.js';
import {messageChunks} from '../server/run-stream.js';
import {toolExecutions} from '../server/tool-progress.js';
import {backup,restore} from '../server/backup.js';
import {Store} from '../server/store.js';
import type {Policy,Run} from '../shared/contracts.js';

test('real PowerShell truncation retains the full output in owned storage and after backup restore',{timeout:30000,skip:process.platform!=='win32'},async()=>{
  const before={...config};Object.assign(config,{apiKey:'offline-output-key',provider:'openai',model:'gpt-5.6-sol',maxCalls:4,budgetUsd:100,reservePerCallUsd:10});
  const root=mkdtempSync(join(tmpdir(),'native-output-worker-'));const source=join(root,'transport');mkdirSync(source);
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'native-output-transport',pi:{extensions:['transport.mjs']}}));
  writeFileSync(join(source,'transport.mjs'),`export default pi=>pi.on('session_start',()=>{let calls=0;globalThis.fetch=async()=>{
    calls++;const item=calls===1?{id:'fc-output',call_id:'call-output',type:'function_call',name:'powershell',arguments:JSON.stringify({command:"[Console]::Write('BEGIN_OUTPUT' + ('x' * 70000) + 'END_OUTPUT')",timeout:10}),status:'completed'}:{id:'msg-output',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'OUTPUT_ARCHIVED',annotations:[]}]};
    const events=calls===1?[{type:'response.output_item.added',output_index:0,item:{...item,arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,item_id:item.id,delta:item.arguments}]:[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},{type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,delta:'OUTPUT_ARCHIVED'}];
    events.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-output',status:'completed',output:[item],usage:{input_tokens:100,output_tokens:10,total_tokens:110,input_tokens_details:{cached_tokens:0}}}});
    return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
  };});`);
  const data=join(root,'data');const app=createApp({dataDir:data,password:'native-output-password',schedule:false});
  try{
    const state=app.plugins.state;const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'transport',trusted:true});const pkg=await inspectPlugin(source,app.plugins.agentDir);state.phase(op.id,'committing','Local transport');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const project=app.service.createProject('原始命令输出');const policy:Policy={version:8,projectId:project.id,toolNames:['powershell'],allowModel:true,modelBinding:app.modelAccess.settings().binding,maxCalls:4,maxCostUsd:40,reservePerCallUsd:10,maxOutputTokens:1024,timeoutMs:20000};
    const run=app.service.submit(project.id,'Produce controlled long output','native-output','pi',policy).run;let done:Run|undefined;
    const deadline=Date.now()+22000;while(Date.now()<deadline){app.scheduler.tick();const current=app.store.get<Run>('run',run.id);if(['completed','failed','interrupted'].includes(current.status)&&!app.scheduler.pluginMaintenanceBlocked()){done=current;break;}await delay(25);}
    assert(done);assert.equal(done.status,'completed',done.error??'native output worker');assert.equal(done.calls,2);
    const tool=toolExecutions(app.store,run.id).items[0];assert.equal(tool.phase,'completed');assert(tool.outputMessageId);assert(tool.resultMessageId);
    const expected='BEGIN_OUTPUT'+'x'.repeat(70000)+'END_OUTPUT';
    assert.equal(messageChunks(app.store,run.id,tool.outputMessageId).map(c=>c.text).join(''),expected);
    const result=JSON.parse(messageChunks(app.store,run.id,tool.resultMessageId).map(c=>c.text).join(''));
    assert.equal(result.details.truncation.truncated,true);assert.equal(readFileSync(result.details.fullOutputPath,'utf8'),expected);
    assert(result.details.fullOutputPath.includes(run.id));
    await app.scheduler.stop();backup(app.store,data,join(root,'backup'));restore(join(root,'backup'),join(root,'restored'));
    const restored=new Store(join(root,'restored','workbench.sqlite'));
    try{assert.equal(messageChunks(restored,run.id,tool.outputMessageId).map(c=>c.text).join(''),expected);assert.equal(toolExecutions(restored,run.id).items[0].outputMessageId,tool.outputMessageId);}finally{restored.close();}
  }finally{await app.close();Object.assign(config,before);}
});

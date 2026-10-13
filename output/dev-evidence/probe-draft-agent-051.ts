import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { config } from '../../server/config.js';
import type { Snapshot,Project,Draft,Asset,Run,Task } from '../../shared/contracts.js';
const path='output/dev-evidence/draft-agent-051-real.json';
const report:Record<string,unknown>={at:new Date().toISOString(),status:'running',scope:'Real Pi on own synthetic draft only; no browser, publication, user article edit or Memory runtime',maximumRequests:4};
const save=()=>writeFileSync(path,JSON.stringify(report,null,2)+'\n');save();
const base=`http://127.0.0.1:${config.port}`;let cookie='';
async function api<T>(path:string,data?:unknown,method='POST'):Promise<T>{
  const response=await fetch(base+'/api'+path,{headers:{Cookie:cookie,Origin:config.origin,'Content-Type':'application/json'},...(data===undefined?{}:{method,body:JSON.stringify(data)})});
  if(!response.ok)throw new Error(`Probe HTTP ${response.status} at ${path}`);return response.json();
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:config.password})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
  const before=await api<Snapshot>('/snapshot');assert(before.config.modelConfigured&&before.config.authMode==='chatgpt'&&before.config.callsRemaining>=4);
  assert(!before.runs.some(r=>['running','queued','waiting_user','waiting_node'].includes(r.status)),'Retain active user task; no probe');
  assert(!before.memories.some(m=>!m.projectId&&m.active&&m.confirmed&&m.kind!=='temporary'),'Do not send personal memory to synthetic probe');
  const oldDrafts=new Map(before.drafts.map(d=>[d.id,hash(d)]));const oldRuns=new Map(before.runs.map(r=>[r.id,hash(r)]));
  const project=await api<Project>('/projects',{name:'当前文章修改 · 独立工程验证',description:'真实Pi修改同一合成稿件，不代表用户业务收益或腾讯实验。'});report.projectId=project.id;
  const nonce='DRAFT_EDIT_'+randomUUID().replaceAll('-','');
  const sourceBody='# 固定合成资料\n\n四周数值12、18、9、21，合计60，平均15。仅用于工程验证。';
  const upload=await api<{id:string}>('/uploads',{projectId:project.id,name:'草稿修改固定来源.md',mime:'text/markdown'});
  const uploaded=await fetch(base+'/api/uploads/'+upload.id,{method:'PUT',headers:{Cookie:cookie,Origin:config.origin},body:sourceBody});assert.equal(uploaded.status,200);const source=await uploaded.json() as Asset;
  const original=await api<Draft>('/drafts',{projectId:project.id,title:'固定资料文章原稿',body:'这是一篇待修改的合成文章。\n\n四周数值为12、18、9、21，合计60，平均15。\n\n这些数据仅用于工程验证，不代表真实业务，也不能证明腾讯Memory效果。',sourceIds:[source.id]});
  report.original={id:original.id,revision:original.revision,sha256:hash(original),sourceId:source.id,sourceHash:source.hash};save();
  const accepted=await api<{task:Task;run:Run}>('/tasks',{projectId:project.id,mode:'pi',commandId:randomUUID(),continueFromRunId:null,assetIds:[],view:'drafts',selectedDraftId:original.id,selectedDraftRevision:1,requestedTools:['read_draft','update_draft'],maxCalls:4,timeoutMs:120000,goal:`修改当前选中的这一篇原稿，不新建文章。先read_draft读取原文，再update_draft修改同一draftId，使用读取返回的revision。标题改为“固定资料文章 · 修改完成”。开头改为一句简洁说明，保留原稿中的12、18、9、21、合计60、平均15以及合成数据和腾讯Memory未验证的局限。在正文末尾单独加一行“修改标记：${nonce}”。正文使用完整修改后的内容，来源由宿主保留。保存后简短说明已更新原稿，不调用其他工具。`});
  report.runId=accepted.run.id;report.taskId=accepted.task.id;report.step='model-task-submitted';save();console.log(JSON.stringify({step:report.step,runId:accepted.run.id,maximumRequests:4}));
  const deadline=Date.now()+180000;let snapshot:Snapshot|undefined;let run:Run|undefined;
  while(Date.now()<deadline){snapshot=await api<Snapshot>('/snapshot');run=snapshot.runs.find(r=>r.id===accepted.run.id);assert(run);if(!['queued','running','waiting_user'].includes(run.status))break;await new Promise(resolve=>setTimeout(resolve,500));}
  assert(run&&snapshot);assert.equal(run.status,'completed',run.error??'Run not completed; do not resubmit');
  assert(run.calls<=4&&run.usage?.complete);const current=snapshot.drafts.find(d=>d.id===original.id)!;
  assert.equal(snapshot.drafts.filter(d=>d.projectId===project.id).length,1);assert.equal(current.revision,2);assert.equal(current.title,'固定资料文章 · 修改完成');assert(current.body.includes(nonce));
  for(const value of ['12','18','9','21','60','15','腾讯','验证'])assert(current.body.includes(value),value);
  assert.deepEqual(current.sourceIds,[source.id]);assert.deepEqual(run.resultDraftIds,[original.id]);assert.equal(run.resultAssetIds.length,0);
  const task=snapshot.tasks.find(t=>t.id===run!.taskId)!;assert.equal(task.acceptance,'needs_review');assert.deepEqual(task.context.selectedDraft,original);
  for(const d of snapshot.drafts.filter(d=>oldDrafts.has(d.id)))assert.equal(hash(d),oldDrafts.get(d.id));
  for(const r of snapshot.runs.filter(r=>oldRuns.has(r.id)))assert.equal(hash(r),oldRuns.get(r.id));
  const exported=await fetch(base+'/api/drafts/'+original.id+'/export',{headers:{Cookie:cookie}});assert.equal(exported.status,200);const markdown=await exported.text();assert(markdown.includes(nonce)&&markdown.includes(source.hash)&&markdown.includes(source.id));
  assert.equal(createHash('sha256').update(readFileSync('data/assets/'+source.locator)).digest('hex'),source.hash);
  report.status='passed';report.step='completed';report.result={draftId:current.id,revision:current.revision,sourceIds:current.sourceIds,calls:run.calls,usage:run.usage,taskAcceptance:task.acceptance,resultDraftIds:run.resultDraftIds,operations:snapshot.operations.filter(o=>o.runId===run!.id).map(o=>({name:o.name,state:o.state})),existingDraftsAndRunsUnchanged:true,exportHasSourceAndResult:true,sourceHashPreserved:true};save();console.log(JSON.stringify({status:'passed',calls:run.calls,draftId:current.id,revision:current.revision}));
} catch(error){report.status='failed';report.error=error instanceof Error?error.message:'Probe failed';save();console.error(JSON.stringify({status:'failed',error:report.error}));process.exitCode=1;}
finally{if(cookie)try{await api('/logout',{});}catch{report.logout='not-confirmed';save();}}

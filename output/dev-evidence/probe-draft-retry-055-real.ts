import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {config} from '../../server/config.js';
import type {Snapshot,Project,Draft,Asset,Run,Task,Operation} from '../../shared/contracts.js';
const path='output/dev-evidence/draft-retry-055-real.json';assert(!existsSync(path),'Do not rerun or overwrite this model probe');
const report:Record<string,unknown>={at:new Date().toISOString(),status:'running',scope:'Real Pi on independent synthetic draft; cancel after first save, retry same Task; no browser or publication',maximumRequests:8};
const save=()=>writeFileSync(path,JSON.stringify(report,null,2)+'\n');save();
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fileHash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const beforeDb=new DatabaseSync('data/workbench.sqlite',{readOnly:true});
const originalEntities=new Map(beforeDb.prepare('SELECT id,body FROM entities').all().map(e=>[String(e.id),hash(e.body)]));
const originalSessions=hash(beforeDb.prepare('SELECT hash,created,expires FROM sessions WHERE expires>? ORDER BY hash').all(Date.now()));beforeDb.close();
const originalConfig=Object.fromEntries(['.env','data/private-model/host.json','data/private-model/chatgpt.json'].filter(existsSync).map(p=>[p,fileHash(p)]));
const base=`http://127.0.0.1:${config.port}`;let cookie='';let ownRun:string|undefined;let ownProject:string|undefined;
async function api<T>(path:string,data?:unknown,method='POST'):Promise<T>{const response=await fetch(base+'/api'+path,{headers:{Cookie:cookie,Origin:config.origin,'Content-Type':'application/json'},...(data===undefined?{}:{method,body:JSON.stringify(data)})});if(!response.ok)throw new Error(`Probe HTTP ${response.status} at ${path}`);return response.json();}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function terminal(id:string){const deadline=Date.now()+180000;while(Date.now()<deadline){const s=await api<Snapshot>('/snapshot');const r=s.runs.find(r=>r.id===id);assert(r);if(!['queued','running','waiting_user'].includes(r.status))return {snapshot:s,run:r};await delay(250);}throw new Error('Observation deadline; do not resubmit this task');}
try{
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:config.password})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
  const before=await api<Snapshot>('/snapshot');assert(before.config.modelConfigured&&before.config.authMode==='chatgpt'&&before.config.callsRemaining>=4);
  assert(!before.runs.some(r=>['running','queued','waiting_user','waiting_node'].includes(r.status)),'Leave active user work running');
  assert(!before.memories.some(m=>!m.projectId&&m.active&&m.confirmed&&m.kind!=='temporary'),'Personal memory must not enter synthetic probe');
  const project=await api<Project>('/projects',{name:'文章取消与重试 · 独立工程验证',description:'合成资料验证同任务保存后取消与真实Pi重试；不是腾讯效果或用户业务结论。'});ownProject=project.id;report.projectId=project.id;
  const upload=await api<{id:string}>('/uploads',{projectId:project.id,name:'重试固定来源.md',mime:'text/markdown'});
  const uploaded=await fetch(base+'/api/uploads/'+upload.id,{method:'PUT',headers:{Cookie:cookie,Origin:config.origin},body:'# 合成事实\n固定数值12、18、9、21，合计60、平均15，仅用于工程验证。'});assert.equal(uploaded.status,200);const source=await uploaded.json() as Asset;
  const firstMarker='STEP_ONE_'+randomUUID().replaceAll('-',''),secondMarker='STEP_TWO_'+randomUUID().replaceAll('-','');
  const draft=await api<Draft>('/drafts',{projectId:project.id,title:'两步合成稿件',body:'合成数值12、18、9、21，合计60、平均15。仅用于工程验证，不证明腾讯Memory效果。',sourceIds:[source.id]});report.draftId=draft.id;
  const accepted=await api<{task:Task;run:Run}>('/tasks',{projectId:project.id,mode:'pi',commandId:randomUUID(),continueFromRunId:null,assetIds:[],view:'drafts',selectedDraftId:draft.id,selectedDraftRevision:1,requestedTools:['read_draft','update_draft'],maxCalls:4,timeoutMs:120000,goal:`修改当前原稿，严格分两步保存，始终只用read_draft和update_draft。先read_draft读取完整当前正文和revision。如果没有“${firstMarker}”，第一次update_draft保留全部原文，只在末尾追加一行“${firstMarker}”，标题不变。然后必须另一次read_draft读取宿主确认的当前稿件，再第二次update_draft保留完整正文并追加一行“${secondMarker}”。如果接续时第一标记已经在正文，不重做第一步，只读取当前版本继续第二步；第二标记已存在则不重复写。每次使用read_draft返回的revision。保留合成数据和未验证局限，保存完简短说明。`});
  ownRun=accepted.run.id;report.firstRunId=ownRun;report.taskId=accepted.task.id;report.step='first-attempt-running';save();console.log(JSON.stringify({step:report.step,runId:ownRun,maximumRequests:8}));
  const deadline=Date.now()+180000;let saved=false;
  while(Date.now()<deadline){const s=await api<Snapshot>('/snapshot');const r=s.runs.find(r=>r.id===ownRun)!;const d=s.drafts.find(d=>d.id===draft.id)!;if(d.revision===2){assert(d.body.includes(firstMarker)&&!d.body.includes(secondMarker));assert.equal(r.status,'running','First attempt ended before cancellation; do not forge a retry');await api(`/runs/${ownRun}/cancel`,{});saved=true;report.step='cancel-requested-after-first-save';save();console.log(JSON.stringify({step:report.step,revision:d.revision}));break;}assert(['queued','running'].includes(r.status),r.error??'No first saved step');await delay(50);}
  assert(saved,'First save not observed; no retry');
  const first=await terminal(ownRun);assert.equal(first.run.status,'cancelled');assert(first.run.calls<=4);assert.equal(first.snapshot.drafts.find(d=>d.id===draft.id)!.revision,2);
  assert(!first.snapshot.operations.some(o=>o.runId===ownRun&&['unknown','started'].includes(o.state)));
  const nativePath=first.run.sessionPath!;assert(nativePath&&first.run.sessionId);const originalNativeHash=fileHash(nativePath);
  const retry=await api<Run>(`/runs/${ownRun}/retry`,{commandId:randomUUID()});ownRun=retry.id;report.retryRunId=ownRun;report.step='retry-running';save();console.log(JSON.stringify({step:report.step,runId:ownRun}));
  assert.equal(retry.taskId,accepted.task.id);assert.equal(retry.parentRunId,first.run.id);assert.equal(retry.attempt,2);assert.equal(retry.continuation?.runId,first.run.id);
  const second=await terminal(ownRun);assert.equal(second.run.status,'completed',second.run.error??'Retry did not complete');assert(second.run.calls<=4&&second.run.usage?.complete);
  const final=second.snapshot.drafts.find(d=>d.id===draft.id)!;assert.equal(final.revision,3);assert.equal(final.body.split(firstMarker).length-1,1);assert.equal(final.body.split(secondMarker).length-1,1);assert.deepEqual(final.sourceIds,[source.id]);
  assert.equal(second.snapshot.drafts.filter(d=>d.projectId===project.id).length,1);assert.equal(fileHash(nativePath),originalNativeHash);assert.notEqual(second.run.sessionId,first.run.sessionId);
  const task=second.snapshot.tasks.find(t=>t.id===accepted.task.id)!;assert.deepEqual(task.context.selectedDraft,draft);assert.equal(task.acceptance,'needs_review');
  const db=new DatabaseSync('data/workbench.sqlite',{readOnly:true});const rows=db.prepare('SELECT id,body FROM entities').all();for(const row of rows)if(originalEntities.has(String(row.id)))assert.equal(hash(row.body),originalEntities.get(String(row.id)),String(row.id));
  const receipts=rows.map(r=>JSON.parse(String(r.body))).filter(r=>[first.run.id,second.run.id].includes(r.runId)&&r.name==='update_draft') as Operation[];
  assert.equal(receipts.length,2);assert(receipts.every(r=>r.state==='completed'));
  const retryRead=rows.map(r=>JSON.parse(String(r.body))).find(r=>r.runId===second.run.id&&r.name==='read_draft'&&r.state==='completed') as Operation;
  assert(retryRead);assert.equal((retryRead.result as {revision:number}).revision,2);db.close();
  assert.equal(fileHash('data/assets/'+source.locator),source.hash);
  report.status='passed';report.step='completed';report.result={firstStatus:first.run.status,retryStatus:second.run.status,firstCalls:first.run.calls,retryCalls:second.run.calls,totalCalls:first.run.calls+second.run.calls,draftRevision:final.revision,retryReadRevision:2,originalTaskRevision:1,sourceIds:final.sourceIds,originalNativeHashPreserved:true,nativeSessionForked:true,updateReceipts:2,markersAppearOnce:true,existingEntitiesUnchanged:true,taskAcceptance:task.acceptance};save();console.log(JSON.stringify({status:report.status,...report.result as object}));
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:'Probe failed';save();console.error(JSON.stringify({status:'failed',error:report.error}));process.exitCode=1;}
finally{
  if(cookie&&report.status!=='passed'&&ownRun)try{const s=await api<Snapshot>('/snapshot');const r=s.runs.find(r=>r.id===ownRun);if(r&&r.projectId===ownProject&&['queued','running'].includes(r.status)){await api(`/runs/${ownRun}/cancel`,{});report.cleanupRun=(await terminal(ownRun)).run.status;}}catch{report.cleanupRun='unconfirmed; inspect own Run before continuing';}
  if(cookie)try{await api('/logout',{});}catch{report.logout='not-confirmed';}
  const db=new DatabaseSync('data/workbench.sqlite',{readOnly:true});report.loginSessionsPreserved=hash(db.prepare('SELECT hash,created,expires FROM sessions WHERE expires>? ORDER BY hash').all(Date.now()))===originalSessions;db.close();
  report.configurationHashesPreserved=Object.entries(originalConfig).every(([p,h])=>fileHash(p)===h);save();
}

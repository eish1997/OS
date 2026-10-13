import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {config} from '../../server/config.js';
import type {Snapshot,Run,Task,Draft,Operation} from '../../shared/contracts.js';
const path='output/dev-evidence/draft-retry-055-resume.json';assert(!existsSync(path),'Preserve the initial retry attempt');
const firstReport=JSON.parse(readFileSync('output/dev-evidence/draft-retry-055-real.json','utf8'));
const original=json('output/dev-evidence/private/draft-retry-054/after.json');
function json(p:string){return JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));}
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const report:Record<string,unknown>={at:new Date().toISOString(),status:'running',scope:'Resume existing cancelled synthetic Pi Task after inspecting actual terminal state; preserve initial 423 failure',firstRunId:firstReport.firstRunId,projectId:firstReport.projectId,draftId:firstReport.draftId,maximumTotalCalls:8};
const save=()=>writeFileSync(path,JSON.stringify(report,null,2)+'\n');save();
const base=`http://127.0.0.1:${config.port}`;let cookie='';let ownRun:string|undefined;
async function api<T>(p:string,data?:unknown):Promise<T>{const r=await fetch(base+'/api'+p,{headers:{Cookie:cookie,Origin:config.origin,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});if(!r.ok)throw new Error(`HTTP ${r.status} at ${p}`);return r.json();}
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function terminal(id:string){const deadline=Date.now()+180000;while(Date.now()<deadline){const s=await api<Snapshot>('/snapshot');const r=s.runs.find(r=>r.id===id)!;assert(r);if(!['queued','running','waiting_user'].includes(r.status))return {s,r};await delay(500);}throw new Error('Existing retry observation timeout; do not resubmit');}
try{
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:config.password})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
  const before=await api<Snapshot>('/snapshot');assert(!before.runs.some(r=>['queued','running','waiting_user','waiting_node'].includes(r.status)));
  const first=before.runs.find(r=>r.id===firstReport.firstRunId)!;const draft=before.drafts.find(d=>d.id===firstReport.draftId)!;const task=before.tasks.find(t=>t.id===first.taskId)!;
  assert.equal(first.status,'cancelled');assert(first.cancelRequested&&first.calls<=4);assert.equal(draft.revision,2);assert.equal(task.context.selectedDraft?.revision,1);
  const firstMarker=task.goal.match(/STEP_ONE_[a-f0-9]+/)![0],secondMarker=task.goal.match(/STEP_TWO_[a-f0-9]+/)![0];assert(draft.body.includes(firstMarker)&&!draft.body.includes(secondMarker));
  assert(!before.operations.some(o=>o.runId===first.id&&['started','unknown'].includes(o.state)));assert(first.sessionPath&&first.sessionId);const nativeHash=hash(first.sessionPath);
  const retry=await api<Run>(`/runs/${first.id}/retry`,{commandId:randomUUID()});ownRun=retry.id;report.retryRunId=ownRun;report.step='retry-running';save();console.log(JSON.stringify({step:report.step,runId:ownRun,maximumRequests:4}));
  assert.equal(retry.taskId,first.taskId);assert.equal(retry.parentRunId,first.id);assert.equal(retry.continuation?.runId,first.id);assert.equal(retry.attempt,2);
  const end=await terminal(retry.id);assert.equal(end.r.status,'completed',end.r.error??'Retry incomplete');assert(end.r.calls<=4&&end.r.usage?.complete);assert(first.calls+end.r.calls<=8);
  const final=end.s.drafts.find(d=>d.id===draft.id)!;assert.equal(final.revision,3);assert.equal(final.body.split(firstMarker).length-1,1);assert.equal(final.body.split(secondMarker).length-1,1);assert.deepEqual(final.sourceIds,draft.sourceIds);
  assert.equal(end.s.drafts.filter(d=>d.projectId===first.projectId).length,1);assert.equal(hash(first.sessionPath),nativeHash);assert.notEqual(end.r.sessionId,first.sessionId);
  const finalTask=end.s.tasks.find(t=>t.id===task.id)!;assert.deepEqual(finalTask.context,task.context);assert.equal(finalTask.acceptance,'needs_review');
  const db=new DatabaseSync('data/workbench.sqlite',{readOnly:true});const rows=db.prepare('SELECT kind,id,body FROM entities').all();
  for(const row of rows)if(original.entityHashes[String(row.id)])assert.equal(digest(row.body),original.entityHashes[String(row.id)],String(row.id));
  const operations=rows.filter(row=>row.kind==='operation').map(row=>JSON.parse(String(row.body))) as Operation[];
  const read=operations.find(o=>o.runId===retry.id&&o.name==='read_draft'&&o.state==='completed');assert(read);assert.equal((read.result as {revision:number}).revision,2);
  const edits=operations.filter(o=>[first.id,retry.id].includes(o.runId)&&o.name==='update_draft');assert.equal(edits.length,2);assert(edits.every(o=>o.state==='completed'));
  const sessions=db.prepare('SELECT hash,created,expires FROM sessions WHERE expires>? ORDER BY hash').all(Date.now());db.close();
  for(const asset of end.s.assets)assert.equal(hash('data/assets/'+asset.locator),asset.hash);
  for(const p of ['.env','data/private-model/host.json'])assert.equal(hash(p),original.configurationHashes[p]);
  assert.equal(end.r.policy.modelBinding?.connectionId,first.policy.modelBinding?.connectionId);assert.equal(end.r.policy.modelBinding?.model,first.policy.modelBinding?.model);
  report.status='passed';report.step='completed';report.result={firstStatus:first.status,retryStatus:end.r.status,firstCalls:first.calls,retryCalls:end.r.calls,totalCalls:first.calls+end.r.calls,draftRevision:3,retryReadRevision:2,originalTaskRevision:1,sourceIds:final.sourceIds,markersAppearOnce:true,updateReceipts:2,originalNativeHashPreserved:true,nativeSessionForked:true,existingEntitiesUnchanged:true,assetHashesValid:true,hostAndEnvUnchanged:true,sameModelConnection:true,taskAcceptance:finalTask.acceptance,counts:{projects:end.s.projects.length,assets:end.s.assets.length,entities:rows.length},sessionsBeforeLogout:sessions.length};save();console.log(JSON.stringify({status:report.status,...report.result as object}));
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:'Retry probe failed';save();console.error(JSON.stringify({status:'failed',error:report.error}));process.exitCode=1;}
finally{
  if(cookie&&report.status!=='passed'&&ownRun)try{const s=await api<Snapshot>('/snapshot');const r=s.runs.find(r=>r.id===ownRun);if(r&&r.projectId===firstReport.projectId&&['queued','running'].includes(r.status)){await api(`/runs/${ownRun}/cancel`,{});report.cleanupRun=(await terminal(ownRun)).r.status;}}catch{report.cleanupRun='unconfirmed; inspect own Run';}
  if(cookie)try{await api('/logout',{});}catch{report.logout='unconfirmed';}
  const db=new DatabaseSync('data/workbench.sqlite',{readOnly:true});report.loginSessionsPreserved=digest(db.prepare('SELECT hash,created,expires FROM sessions WHERE expires>? ORDER BY hash').all(Date.now()))===original.sessionDigest;db.close();save();
}

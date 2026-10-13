import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { config } from '../server/config.js';
import type { Asset, Run, Snapshot, WorkbenchEvent } from '../shared/contracts.js';

const base=`http://127.0.0.1:${config.port}`;
const directory='output/dev-evidence';mkdirSync(directory,{recursive:true});
const path=`${directory}/pi-real-lifecycle.json`;
if(existsSync(path)){mkdirSync(`${directory}/lifecycle-history`,{recursive:true});copyFileSync(path,`${directory}/lifecycle-history/${Date.now()}.json`);}
const report:{at:string;status:string;cases:unknown[];[key:string]:unknown}={at:new Date().toISOString(),status:'running',cases:[],limits:{requestsPerTask:2,timeoutProbeMs:15000,cancelGraceMs:5000},scope:'New non-sensitive project; write_asset only; no automatic retry'};
const save=()=>writeFileSync(path,JSON.stringify(report,null,2));save();
const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:config.password})});if(!login.ok)throw new Error('生命周期探针本机鉴权失败');const cookie=login.headers.get('set-cookie')!.split(';')[0];
async function api<T>(path:string,data?:unknown):Promise<T>{const r=await fetch(base+'/api'+path,{headers:{Cookie:cookie,Origin:config.origin,'Content-Type':'application/json'},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});if(!r.ok)throw new Error(`生命周期接口未完成（HTTP ${r.status}）`);return r.json();}
const pause=()=>new Promise<void>(r=>setTimeout(r,250));
const terminal=(r:Run)=>!['queued','running','waiting_user'].includes(r.status);
const owned:string[]=[];
const streamAbort=new AbortController();
const streamEvents:WorkbenchEvent[]=[];
let streamTask:Promise<void>|undefined;
async function watchEvents(cursor:number){
  const response=await fetch(base+`/api/events?after=${cursor}`,{headers:{Cookie:cookie},signal:streamAbort.signal});
  if(!response.ok||!response.body)throw new Error('任务事件流不可读');
  streamTask=(async()=>{const reader=response.body!.getReader();const decoder=new TextDecoder();let buffer='';try{while(true){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true});let end:number;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=frame.split('\n').find(l=>l.startsWith('data: '));if(line){const event=JSON.parse(line.slice(6)) as WorkbenchEvent;if(event.type==='model.output.started')streamEvents.push(event);}}}}catch(e){if(!streamAbort.signal.aborted)throw e;}finally{reader.releaseLock();}})();
}
async function view(id:string){const snapshot=await api<Snapshot>('/snapshot');const run=snapshot.runs.find(r=>r.id===id);if(!run)throw new Error('探针任务不存在');return {snapshot,run};}
async function outputs(id:string){return streamEvents.filter(e=>e.runId===id);}
function gone(pid?:number){if(!pid)return false;try{process.kill(pid,0);return false;}catch(e){return e instanceof Error&&'code' in e&&e.code==='ESRCH';}}
async function content(asset:Asset){const r=await fetch(base+`/api/assets/${asset.id}`,{headers:{Cookie:cookie}});if(!r.ok)throw new Error('检查点不可读');return r.text();}
try {
  const snapshot=await api<Snapshot>('/snapshot');assert(snapshot.config.modelConfigured,'模型未就绪');assert(snapshot.config.callsRemaining>=4,'自定义剩余上限不足4次');assert(!snapshot.runs.some(r=>['running','queued'].includes(r.status)),'已有用户任务，稍后再验证');assert(!snapshot.memories.some(m=>!m.projectId&&m.confirmed&&m.active&&!m.deleted&&m.kind!=='temporary'),'存在个人确认记忆；固定输入探针需先支持显式记忆范围');
  report.model=snapshot.config.model;report.authKind=snapshot.config.authMode;
  await watchEvents(snapshot.cursor);
  const project=await api<{id:string;revision:number}>('/projects',{name:'Pi 停止控制验证',description:'固定无敏感输入：取消/超时及保留成果验证。'});report.projectId=project.id;save();
  const upload=await api<{id:string}>('/uploads',{projectId:project.id,name:'保留检查点.md',mime:'text/markdown'});const uploaded=await fetch(base+`/api/uploads/${upload.id}`,{method:'PUT',headers:{Cookie:cookie,Origin:config.origin},body:'LIFECYCLE_RETAINED_OK'});assert(uploaded.ok);const retained=await uploaded.json() as Asset;
  for(const kind of ['cancel','timeout'] as const) {
    const name=`${kind}-checkpoint.md`;const marker=`${kind.toUpperCase()}_CHECKPOINT_OK`;
    const submitted=await api<{run:Run}>('/tasks',{projectId:project.id,mode:'pi',commandId:randomUUID(),requestedTools:['write_asset'],maxCalls:2,timeoutMs:kind==='timeout'?15000:60000,goal:`这是可信固定输入的停止控制测试。第一步必须用write_asset保存${name}，内容严格为${marker}。然后仅在对话中逐项输出1到10000的编号清单，用于验证流式停止；不要再调用任何工具，不读取其他资料，不以测试为业务结论。`});owned.push(submitted.run.id);
    const begun=Date.now();let cancelledAt:number|undefined;let observed:WorkbenchEvent[]=[];let v=await view(submitted.run.id);
    while(!terminal(v.run)&&Date.now()-begun<75000) {
      observed=await outputs(v.run.id);
      if(kind==='cancel'&&!cancelledAt&&observed.some(e=>(e.data as {callNumber:number}).callNumber===2)&&v.snapshot.assets.some(a=>a.runId===v.run.id&&a.name===name)) {cancelledAt=Date.now();await api(`/runs/${v.run.id}/cancel`,{});}
      await pause();v=await view(v.run.id);
    }
    if(!terminal(v.run)){await api(`/runs/${v.run.id}/cancel`,{});throw new Error('停止探针未在观察上限内终止，已请求取消本探针');}
    const stopped=Date.now();while(!gone(v.run.workerPid)&&Date.now()-stopped<7000)await pause();
    const checkpoint=v.snapshot.assets.find(a=>a.runId===v.run.id&&a.name===name);
    const checkpointVerified=checkpoint?await content(checkpoint)===marker:false;
    assert.equal(await content(retained),'LIFECYCLE_RETAINED_OK');
    const beforeCalls=v.run.calls;await new Promise(r=>setTimeout(r,2000));const after=await view(v.run.id);assert.equal(after.run.calls,beforeCalls);
    const receiptsVerified=after.run.modelCallsSettled===after.run.calls&&after.run.modelCallsReported===after.run.calls-1;
    const passed=receiptsVerified&&(kind==='cancel'?Boolean(cancelledAt&&after.run.status==='cancelled'&&checkpointVerified&&gone(after.run.workerPid)&&!after.run.usage?.complete):Boolean(after.run.status==='failed'&&after.run.timedOutAt&&observed.length&&gone(after.run.workerPid)&&!after.run.usage?.complete));
    const evidence={kind,passed,runId:after.run.id,status:after.run.status,error:after.run.error,calls:after.run.calls,settled:after.run.modelCallsSettled,reported:after.run.modelCallsReported,usage:after.run.usage,realStreamObserved:observed.length>0,observedRequests:observed.map(e=>(e.data as {callNumber:number}).callNumber),checkpointVerified,existingAssetRetained:true,workerExited:gone(after.run.workerPid),callsStableAfterStop:true,elapsedMs:Date.now()-begun,cancelToTerminalMs:cancelledAt?stopped-cancelledAt:undefined,timeoutPolicyMs:after.run.policy.timeoutMs};
    report.cases.push(evidence);save();console.log(JSON.stringify(evidence));assert(passed,'真实停止控制场景未通过');
  }
  report.status='passed';report.at=new Date().toISOString();report.remaining=['native session continuation with model','provider failure/recovery','complete M0/M1 acceptance'];save();
} catch(e) {report.status='failed';report.reason=e instanceof assert.AssertionError?e.message:e instanceof Error?e.message:'Lifecycle probe failed';save();throw e;}
finally {for(const id of owned){try{const v=await view(id);if(!terminal(v.run))await api(`/runs/${id}/cancel`,{});}catch{}}streamAbort.abort();await streamTask;await api('/logout',{});}

import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp} from '../server/app.js';
import {AppError} from '../server/store.js';
import {config} from '../server/config.js';
import type {Run,Policy} from '../shared/contracts.js';
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'取消竞争 '));const app=createApp({dataDir:root,password:'cancel-test',schedule:false,storageLimits:{minFreeBytes:0}});
  const project=app.service.createProject('合成取消项目');
  const policy:Policy={version:6,projectId:project.id,allowModel:false,toolNames:[],maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
  const run=app.service.submit(project.id,'控制请求','first','fixture',policy).run;app.service.transition(run.id,'running');
  return {root,app,run,policy,project};
}
async function holder(root:string,ms:number){return child('tests/helpers/capacity-lock.ts',[root,String(ms)]);}
async function child(path:string,args:string[]){
  const childProcess=fork(resolve(path),args,{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const closed=once(childProcess,'close');await once(childProcess,'message');return {process:childProcess,closed};
}
const status=(value:number)=>(e:unknown)=>e instanceof AppError&&e.status===value;
const cancelEvents=(q:ReturnType<typeof fixture>)=>q.app.store.events(0).filter(e=>e.runId===q.run.id&&e.type==='run.cancel_requested');

test('concurrent HTTP cancellation waits for brief real writer contention while reads stay responsive and records one request',async()=>{
  const q=fixture();let held:Awaited<ReturnType<typeof holder>>|undefined;
  try{
    await new Promise<void>(r=>q.app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(q.app.server.address() as {port:number}).port}`;
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'cancel-test'})});assert.equal(login.status,200);
    const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],Origin:config.origin,'Content-Type':'application/json'};
    held=await holder(q.root,700);let cancelled=false;
    const first=fetch(base+`/api/runs/${q.run.id}/cancel`,{method:'POST',headers,body:'{}'}).then(async r=>{cancelled=true;return {status:r.status,run:await r.json() as Run};});
    const second=fetch(base+`/api/runs/${q.run.id}/cancel`,{method:'POST',headers,body:'{}'}).then(async r=>({status:r.status,run:await r.json() as Run}));
    await new Promise(r=>setTimeout(r,40));const read=await fetch(base+'/api/snapshot',{headers});assert.equal(read.status,200);assert(!cancelled,'A read must complete while cancellation is waiting for the held gate');
    const [a,b]=await Promise.all([first,second]);assert.equal(a.status,200);assert.equal(b.status,200);assert(a.run.cancelRequested&&b.run.cancelRequested);assert.equal(a.run.status,'running');
    assert.equal(a.run.revision,b.run.revision);assert.equal(a.run.cancelRequestedAt,b.run.cancelRequestedAt);assert.equal(cancelEvents(q).length,1);
    assert.equal(q.app.store.get<Run>('run',q.run.id).calls,0);assert.equal((await held.closed)[0],0);
  }finally{if(held)await held.closed;await q.app.close();}
});

test('long-lived real writer returns bounded busy without changing cancellation or taking the live lock',async()=>{
  const q=fixture();let held:Awaited<ReturnType<typeof holder>>|undefined;
  try{
    const original=q.app.store.get<Run>('run',q.run.id);held=await holder(q.root,2300);const lock=join(q.root,'.storage-write.lock'),bytes=readFileSync(lock);
    let ticks=0;const clock=setInterval(()=>ticks++,20);const start=Date.now();
    try{await assert.rejects(q.app.service.requestCancel(q.run.id),status(423));}finally{clearInterval(clock);}
    assert(Date.now()-start<2000,'The acquisition wait is bounded');assert(ticks>=5,'Waiting must yield the event loop');
    assert.deepEqual(q.app.store.get<Run>('run',q.run.id),original);assert.equal(cancelEvents(q).length,0);assert(readFileSync(lock).equals(bytes));
    assert.equal((await held.closed)[0],0);assert((await q.app.service.requestCancel(q.run.id)).cancelRequested);assert.equal(cancelEvents(q).length,1);
  }finally{if(held)await held.closed;await q.app.close();}
});

test('cancel rechecks a terminal state committed by the actual lock owner before acquisition',async()=>{
  const q=fixture();let held:Awaited<ReturnType<typeof child>>|undefined;
  try{
    held=await child('tests/helpers/cancel-state-writer.ts',[q.root,q.run.id]);assert.equal(q.app.store.get<Run>('run',q.run.id).status,'running');
    const result=await q.app.service.requestCancel(q.run.id);assert.equal(result.status,'completed');assert(!result.cancelRequested);assert.equal(cancelEvents(q).length,0);
    assert.equal((await held.closed)[0],0);assert.deepEqual(await q.app.service.requestCancel(q.run.id),result);
  }finally{if(held)await held.closed;await q.app.close();}
});

test('cancel flag and event roll back together and an entered callback failure is never automatically replayed',async()=>{
  const q=fixture();try{
    const original=q.app.store.get<Run>('run',q.run.id);const event=q.app.store.event.bind(q.app.store);let attempts=0;
    q.app.store.event=(...args:Parameters<typeof event>)=>{if(args[0]==='run.cancel_requested'){attempts++;throw new AppError(423,'其他进程正在写入，稍后重试');}return event(...args);};
    await assert.rejects(q.app.service.requestCancel(q.run.id),status(423));assert.equal(attempts,1);assert.deepEqual(q.app.store.get<Run>('run',q.run.id),original);assert.equal(cancelEvents(q).length,0);
    q.app.store.event=event;const cancelled=await q.app.service.requestCancel(q.run.id);assert(cancelled.cancelRequested);assert.equal(cancelEvents(q).length,1);
    assert.deepEqual(await q.app.service.requestCancel(q.run.id),cancelled);assert.equal(cancelEvents(q).length,1);
  }finally{await q.app.close();}
});

test('malformed lock bytes survive rejection; queued cancellation stays atomic and terminal requests are read-only',async()=>{
  const q=fixture();const lock=join(q.root,'.storage-write.lock');try{
    const original=q.app.store.get<Run>('run',q.run.id);writeFileSync(lock,'controlled-malformed-lock');
    await assert.rejects(q.app.service.requestCancel(q.run.id),status(423));assert.equal(readFileSync(lock,'utf8'),'controlled-malformed-lock');assert.deepEqual(q.app.store.get<Run>('run',q.run.id),original);
    unlinkSync(lock); // This exact malformed file was created by this test only.
    const queued=q.app.service.submit(q.project.id,'排队任务','queued','fixture',q.policy).run;const next=await q.app.service.requestCancel(queued.id);
    assert.equal(next.status,'cancelled');assert(next.cancelRequested);const cursor=q.app.store.events(0).length;
    writeFileSync(lock,'controlled-malformed-lock');assert.deepEqual(await q.app.service.requestCancel(next.id),next);assert.equal(q.app.store.events(0).length,cursor);assert.equal(readFileSync(lock,'utf8'),'controlled-malformed-lock');
    unlinkSync(lock);
  }finally{await q.app.close();}
});

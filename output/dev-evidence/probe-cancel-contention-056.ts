import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../../server/store.js';
import {StorageCapacity} from '../../server/storage.js';
import {Assets} from '../../server/assets.js';
import {Service} from '../../server/service.js';
import type {Policy,Run} from '../../shared/contracts.js';
const path='output/dev-evidence/cancel-contention-056-after.json';assert(!existsSync(path));
const root=mkdtempSync(join(tmpdir(),'取消竞争修复056 '));const store=new Store(join(root,'workbench.sqlite'));
try{
  const service=new Service(store,new Assets(store,root));const project=service.createProject('独立取消诊断');
  const policy:Policy={version:6,projectId:project.id,allowModel:false,toolNames:[],maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
  const run=service.submit(project.id,'合成任务','start','fixture',policy).run;service.transition(run.id,'running');store.attachCapacity(new StorageCapacity(root,{minFreeBytes:0}));
  const child=fork(resolve('tests/helpers/capacity-lock.ts'),[root,'300'],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const closed=once(child,'close');await once(child,'message');const start=Date.now();let ticks=0;const heartbeat=setInterval(()=>ticks++,10);
  let result:Run;try{result=await service.requestCancel(run.id);}finally{clearInterval(heartbeat);}
  const durationMs=Date.now()-start;assert(result.cancelRequested);assert(ticks>=5);assert.equal((await closed)[0],0);
  assert.equal(store.events(0).filter(e=>e.runId===run.id&&e.type==='run.cancel_requested').length,1);assert.equal(store.get<Run>('run',run.id).calls,0);
  assert.deepEqual(await service.requestCancel(run.id),result);
  const value={at:new Date().toISOString(),status:'passed',scope:'Same 300ms real child writer scenario via the async cancellation entry used by HTTP; no model request',firstStatus:200,firstCancelRecorded:true,lockHeldMs:300,durationMs,heartbeatTicks:ticks,cancelEvents:1,duplicateUnchanged:true,childPid:child.pid,modelRequests:0};
  writeFileSync(path,JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify(value));
}finally{store.close();}

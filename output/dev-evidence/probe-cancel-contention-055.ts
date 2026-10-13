import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store,AppError} from '../../server/store.js';
import {StorageCapacity} from '../../server/storage.js';
import {Assets} from '../../server/assets.js';
import {Service} from '../../server/service.js';
import type {Policy,Run} from '../../shared/contracts.js';
const path='output/dev-evidence/cancel-contention-055-before.json';assert(!existsSync(path));
const root=mkdtempSync(join(tmpdir(),'取消存储竞争055 '));const store=new Store(join(root,'workbench.sqlite'));
try{
  const service=new Service(store,new Assets(store,root));const project=service.createProject('独立取消诊断');
  const policy:Policy={version:6,projectId:project.id,allowModel:false,toolNames:[],maxCalls:0,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
  const run=service.submit(project.id,'合成任务','start','fixture',policy).run;service.transition(run.id,'running');
  store.attachCapacity(new StorageCapacity(root,{minFreeBytes:0}));
  const child=fork(resolve('tests/helpers/capacity-lock.ts'),[root,'300'],{execPath:process.execPath,execArgv:['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const closed=once(child,'close');await once(child,'message');const start=Date.now();let firstError:unknown;
  try{service.cancel(run.id);}catch(error){firstError=error;}
  const firstDurationMs=Date.now()-start;assert(firstError instanceof AppError&&firstError.status===423);assert(!store.get<Run>('run',run.id).cancelRequested);
  const exit=await closed;assert.equal(exit[0],0);const afterRelease=service.cancel(run.id);assert(afterRelease.cancelRequested);
  assert.equal(store.events(0).filter(e=>e.runId===run.id&&e.type==='run.cancel_requested').length,1);assert.equal(store.get<Run>('run',run.id).calls,0);
  const result={at:new Date().toISOString(),status:'reproduced',scope:'Isolated cancellation under a real child storage writer; no model request',firstStatus:firstError.status,firstMessage:firstError.message,firstDurationMs,lockHeldMs:300,firstCancelRecorded:false,cancelAfterWriterExit:true,cancelEvents:1,childPid:child.pid,childExit:exit[0],modelRequests:0};
  writeFileSync(path,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{store.close();}

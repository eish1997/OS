import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../../server/store.js';
import {Service} from '../../server/service.js';
import {Assets} from '../../server/assets.js';
import type {Policy,Run} from '../../shared/contracts.js';
const path='output/dev-evidence/task-budget-056-before.json';assert(!existsSync(path));
const root=mkdtempSync(join(tmpdir(),'任务重试预算056 '));const store=new Store(join(root,'workbench.sqlite'));
try{
  const service=new Service(store,new Assets(store,root));const project=service.createProject('合成预算项目');
  const policy:Policy={version:6,projectId:project.id,allowModel:true,modelBinding:{kind:'chatgpt',provider:'openai',model:'offline-fixture',connectionId:'synthetic'},toolNames:[],maxCalls:2,maxCostUsd:0,reservePerCallUsd:0,maxOutputTokens:100,timeoutMs:10000};
  const first=service.submit(project.id,'同一目标','start','pi',policy).run;service.transition(first.id,'running');
  service.reserveCall(first.id,undefined,0);service.reserveCall(first.id,undefined,0);service.transition(first.id,'failed');
  const retry=service.retry(first.id,'retry');service.transition(retry.id,'running');service.reserveCall(retry.id,undefined,0);
  const attempts=store.list<Run>('run').filter(r=>r.taskId===first.taskId);const taskCalls=attempts.reduce((n,r)=>n+r.calls,0);
  assert.equal(taskCalls,3);assert.equal(policy.maxCalls,2);assert.equal(attempts.length,2);
  const value={at:new Date().toISOString(),status:'reproduced',scope:'Host reservation ledger only; synthetic model binding; no model/network request',configuredPerTaskLimit:2,taskCallsReserved:taskCalls,attempts:attempts.map(r=>({attempt:r.attempt,calls:r.calls})),sameTask:true,modelRequests:0};
  writeFileSync(path,JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify(value));
}finally{store.close();}

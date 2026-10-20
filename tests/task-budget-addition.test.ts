import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Service } from '../server/service.js';
import { Assets } from '../server/assets.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { TaskBudgetGrant } from '../shared/pi-runtime.js';

function setup(subscription = false) {
  const dir = mkdtempSync(join(tmpdir(), 'budget-addition-'));
  const store = new Store(join(dir, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, dir));
  const project = service.createProject('追加授权验证');
  const policy: Policy = { version: 8, projectId: project.id, allowModel: true, toolNames: [], maxCalls: 1, maxCostUsd: 1, reservePerCallUsd: subscription ? 0 : 1, maxOutputTokens: 100, timeoutMs: 10000,
    modelBinding: subscription ? { kind: 'chatgpt', provider: 'openai', model: 'fixture', connectionId: 'fixture' } : undefined };
  const run = service.submit(project.id, '原始目标', 'first', 'pi', policy).run;
  service.transition(run.id, 'running'); service.reserveCall(run.id, undefined, 100);
  service.settleCall(run.id, undefined, undefined, 1); service.transition(run.id, 'failed');
  return {dir,store,service,run,policy};
}

test('budget addition is atomic and replayable, preserves old grants and accounts all attempts after reopen', () => {
  const f = setup();
  const addition = {calls:2,costUsd:2,reason:'继续完成目标'};
  let resumed: Run;
  try {
    const old = f.store.get<Run>('run',f.run.id);
    resumed = JSON.parse(JSON.stringify(f.service.retry(f.run.id,'add',addition)));
    assert.deepEqual(f.service.retry(f.run.id,'add',addition),resumed);
    assert.throws(()=>f.service.retry(f.run.id,'add',{...addition,calls:3}),/不同|冲突|重复/);
    assert.throws(()=>f.service.retry(f.run.id,'another',addition),/后续执行/);
    assert.deepEqual(f.store.get<Run>('run',f.run.id),old);
    assert.equal(resumed.taskId,old.taskId);assert.equal(resumed.policy.maxCalls,3);assert.equal(resumed.policy.maxCostUsd,3);
    const grant=f.store.list<TaskBudgetGrant>('task_budget_grant')[0];
    assert.deepEqual(grant.before,{maxCalls:1,maxCostUsd:1});assert.deepEqual(grant.after,{maxCalls:3,maxCostUsd:3});
    assert.equal(f.store.list<TaskBudgetGrant>('task_budget_grant').length,1);
  } finally {f.store.close();}
  const store=new Store(join(f.dir,'workbench.sqlite'));const service=new Service(store,new Assets(store,f.dir));
  try {
    assert.deepEqual(service.retry(f.run.id,'add',addition),resumed!);
    service.transition(resumed!.id,'running');
    for(let i=0;i<2;i++){service.reserveCall(resumed!.id,undefined,100);service.settleCall(resumed!.id,undefined,undefined,i+1);}
    assert.throws(()=>service.reserveCall(resumed!.id,undefined,100),/累计模型调用/);
    const budget=service.taskBudget(f.run.id);assert.equal(budget.usedCalls,3);assert.equal(budget.remainingCalls,0);assert.equal(budget.accountedUsd,3);assert.equal(budget.remainingUsd,0);
  } finally {store.close();}
});

test('invalid or rolled-back additions leave neither authorization nor queued retry; subscription cost remains separate',()=>{
  const f=setup(true);
  try {
    for(const addition of [{calls:0,costUsd:0,reason:'x'},{calls:-1,costUsd:0,reason:'x'},{calls:1.5,costUsd:0,reason:'x'},{calls:1,costUsd:1,reason:'x'},{calls:1,costUsd:0,reason:''}])assert.throws(()=>f.service.retry(f.run.id,'invalid',addition));
    f.store.db.exec("CREATE TRIGGER reject_grant BEFORE INSERT ON entities WHEN NEW.kind='task_budget_grant' BEGIN SELECT RAISE(ABORT,'controlled grant failure'); END");
    assert.throws(()=>f.service.retry(f.run.id,'rollback',{calls:1,costUsd:0,reason:'增加请求'}),/controlled grant failure/);
    assert.equal(f.store.list<Run>('run').length,1);assert.equal(f.store.list('task_budget_grant').length,0);
    f.store.db.exec('DROP TRIGGER reject_grant');
    const next=f.service.retry(f.run.id,'rollback',{calls:1,costUsd:0,reason:'增加请求'});
    f.service.transition(next.id,'running');
    assert.throws(()=>f.service.reserveCall(next.id,1,100),/次数已达上限/,'connection limit is not increased by task authorization');
    f.service.reserveCall(next.id,undefined,100);
    assert.equal(f.service.taskBudget(next.id).usedCalls,2);
  } finally {f.store.close();}
});

test('budget HTTP requires authentication and same origin, validates additions and accepts only one competing resume',async()=>{
  const app=createApp({dataDir:mkdtempSync(join(tmpdir(),'budget-http-')),password:'budget-test-password',schedule:false});
  await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  try {
    const project=app.service.createProject('HTTP budget');
    const policy:Policy={version:8,projectId:project.id,allowModel:true,toolNames:[],maxCalls:1,maxCostUsd:1,reservePerCallUsd:1,maxOutputTokens:100,timeoutMs:10000};
    const run=app.service.submit(project.id,'fixture','http-first','pi',policy).run;app.service.transition(run.id,'running');app.service.transition(run.id,'failed');
    const url=base+`/api/runs/${run.id}`;
    assert.equal((await fetch(url+'/budget')).status,401);
    assert.equal((await fetch(url+'/extend-retry',{method:'POST',body:'{}'})).status,401);
    const login=await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({password:'budget-test-password'})});
    const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0],'Content-Type':'application/json'};
    const body={commandId:'addition-http',calls:1,costUsd:1,reason:'继续'};
    const post=(data:unknown,extra={})=>fetch(url+'/extend-retry',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
    assert.equal((await post(body,{Origin:'https://foreign.invalid'})).status,403);
    assert.equal((await post({...body,calls:'1'})).status,400);
    const results=await Promise.all([post(body),post({...body,commandId:'competing-http'})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const accepted=results.findIndex(r=>r.status===200);
    app.service.prepareRetry = async () => { throw new Error('History preparation must not run for an accepted command replay'); };
    const replay=await post({...body,commandId:accepted===0?'addition-http':'competing-http'});assert.equal(replay.status,200);
    const snapshot=await (await fetch(url+'/budget',{headers})).json();assert.equal(snapshot.maxCalls,2);assert.equal(snapshot.grants.length,1);
  } finally {await app.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Store, AppError } from '../server/store.js';
import { Service } from '../server/service.js';
import { Assets } from '../server/assets.js';
import { backup, restore } from '../server/backup.js';
import type { Policy, Run, Task } from '../shared/contracts.js';

const denied = (e: unknown) => e instanceof AppError && e.status === 429;
function setup(subscription = true, maxCalls = 2, maxCostUsd = 2) {
  const dir = mkdtempSync(join(tmpdir(), '任务累计预算 '));
  const store = new Store(join(dir, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, dir));
  const project = service.createProject('预算验证');
  const policy: Policy = { version: 6, projectId: project.id, allowModel: true, toolNames: [], maxCalls, maxCostUsd, reservePerCallUsd: subscription ? 0 : 1, maxOutputTokens: 100, timeoutMs: 10000,
    modelBinding: subscription ? { kind: 'chatgpt', provider: 'openai', model: 'synthetic', connectionId: 'synthetic-connection' } : undefined };
  const start = (command: string) => { const r = service.submit(project.id, '独立目标', command, 'pi', policy).run; return service.transition(r.id, 'running'); };
  const retry = (id: string, command: string) => service.transition(service.retry(id, command).id, 'running');
  return { dir, store, service, project, policy, start, retry };
}

test('failed, cancelled and reconciled interrupted retries share calls; a new goal retains its allowance', () => {
  for (const status of ['failed', 'cancelled', 'interrupted'] as const) {
    const f = setup(); try {
      const first = f.start('first'); const task = f.store.get<Task>('task', first.taskId);
      f.service.reserveCall(first.id, undefined, 0); // Unknown usage still occupies a request.
      f.service.transition(first.id, status, { error: status === 'interrupted' ? '已对账' : undefined });
      const second = f.retry(first.id, 'second'); f.service.reserveCall(second.id, undefined, 0);
      f.service.transition(second.id, 'failed'); const third = f.retry(second.id, 'third');
      const before = f.store.get<Run>('run', third.id); const cursor = f.store.cursor();
      assert.throws(() => f.service.reserveCall(third.id, undefined, 0), denied);
      assert.deepEqual(f.store.get<Run>('run', third.id), before); assert.equal(f.store.cursor(), cursor);
      assert.equal(f.store.list<Run>('run').filter(r => r.taskId === first.taskId).reduce((n, r) => n + r.calls, 0), 2);
      assert.deepEqual(f.store.get<Task>('task', task.id), task);
      const fresh = f.start('fresh'); f.service.reserveCall(fresh.id, undefined, 0); assert.notEqual(fresh.taskId, task.id);
    } finally { f.store.close(); }
  }
});

test('connection cumulative cap remains effective across independent goals and retry attempts', () => {
  const f = setup(); try {
    const first = f.start('first'); f.service.reserveCall(first.id, 2, 0); f.service.transition(first.id, 'failed');
    const second = f.retry(first.id, 'retry'); f.service.reserveCall(second.id, 2, 0);
    const fresh = f.start('fresh'); assert.throws(() => f.service.reserveCall(fresh.id, 2, 0), denied);
    f.service.reserveCall(fresh.id, undefined, 0); assert.equal(f.store.get<Run>('run', fresh.id).calls, 1);
  } finally { f.store.close(); }
});

test('API task cap retains spent and unresolved reservations across retries without consuming rejected allowance', () => {
  const f = setup(false, 10, 3); try {
    const first = f.start('first'); f.service.reserveCall(first.id, undefined, 100); f.service.settleCall(first.id, 1);
    f.service.reserveCall(first.id, undefined, 100); // Unresolved reservation is not refunded by retry.
    f.service.transition(first.id, 'failed'); const second = f.retry(first.id, 'retry');
    f.service.reserveCall(second.id, undefined, 100);
    assert.throws(() => f.service.reserveCall(second.id, undefined, 100), denied);
    assert.equal(f.store.get<Run>('run', second.id).calls, 1);
    assert.equal(f.store.get<Run>('run', first.id).reservedUsd, 1);
    f.service.settleCall(second.id); // Unknown actual cost charges the reserve.
    f.service.transition(second.id, 'failed'); const third = f.retry(second.id, 'third');
    assert.throws(() => f.service.reserveCall(third.id, undefined, 100), denied);
    const fresh = f.start('fresh'); assert.throws(() => f.service.reserveCall(fresh.id, undefined, 3), denied);
    f.service.reserveCall(fresh.id, undefined, 4);
  } finally { f.store.close(); }
});

test('reopen and clean joint restore preserve original grant and retry counts without rewriting history', () => {
  const f = setup(); const first = f.start('first'); f.service.reserveCall(first.id, undefined, 0); f.service.reserveCall(first.id, undefined, 0);
  f.service.transition(first.id, 'cancelled'); const original = f.store.get<Run>('run', first.id);
  const destination = join(mkdtempSync(join(tmpdir(), '预算恢复 ')), 'pack'); backup(f.store, f.dir, destination); f.store.close();
  const restoredDir = join(mkdtempSync(join(tmpdir(), '预算新目录 ')), 'restore'); restore(destination, restoredDir);
  for (const dir of [f.dir, restoredDir]) {
    const store = new Store(join(dir, 'workbench.sqlite')); try {
      const prior = store.get<Run>('run', first.id);
      assert.equal(prior.calls, original.calls); assert.deepEqual(prior.policy, original.policy); assert.deepEqual(prior.usage, original.usage);
      assert.equal(prior.taskId, original.taskId); assert.equal(prior.status, original.status);
      const service = new Service(store, new Assets(store, dir)); const retry = service.retry(first.id, 'retry'); service.transition(retry.id, 'running');
      assert.throws(() => service.reserveCall(retry.id, undefined, 0), denied); assert.deepEqual(store.get<Run>('run', first.id), prior);
    } finally { store.close(); }
  }
});

test('two actual processes competing for the last task call admit exactly one reservation', async () => {
  const f = setup(); try {
    const first = f.start('first'); f.service.reserveCall(first.id, undefined, 0); f.service.transition(first.id, 'failed');
    const resumed = f.retry(first.id, 'a');
    assert.throws(() => f.retry(first.id, 'b'), /后续执行/);
    const runs = [resumed, resumed];
    const children = runs.map(run => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'tests/helpers/task-budget-reserver.ts', f.dir, run.id], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', errors = ''; let readyResolve!: () => void;
      const ready = new Promise<void>(resolve => { readyResolve = resolve; });
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('ready\n')) readyResolve(); });
      child.stderr.on('data', chunk => { errors += chunk; });
      const completed = new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('close', code => {
        if (code !== 0) reject(new Error(errors || `Child exited ${code}`));
        else resolve(Number(output.trim().split('\n').at(-1)));
      }); });
      const readyOrFailure = Promise.race([ready, completed.then(() => { throw new Error('Child exited before release'); })]);
      return { child, ready: readyOrFailure, completed };
    });
    try { await Promise.all(children.map(c => c.ready)); children.forEach(c => c.child.stdin.end('go\n'));
      assert.deepEqual((await Promise.all(children.map(c => c.completed))).sort(), [200, 429]);
      assert.equal(f.store.list<Run>('run').filter(r => r.taskId === first.taskId).reduce((n, r) => n + r.calls, 0), 2);
    } finally { for (const c of children) if (c.child.exitCode === null) c.child.kill(); }
  } finally { f.store.close(); }
});

test('cancelled, expired or disallowed runs cannot reserve even when cumulative allowance remains', () => {
  const f = setup(); try {
    for (const reason of ['cancel', 'expired', 'disallowed']) {
      const run = f.start(reason);
      if (reason === 'cancel') f.service.cancel(run.id);
      else f.store.update<Run>('run', run.id, run.revision, reason === 'expired' ? { startedAt: new Date(Date.now() - 20000).toISOString() } : { policy: { ...run.policy, allowModel: false } });
      assert.throws(() => f.service.reserveCall(run.id, undefined, 0), (e: unknown) => e instanceof AppError && e.status === 403);
      assert.equal(f.store.get<Run>('run', run.id).calls, 0);
    }
  } finally { f.store.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Policy, Run } from '../shared/contracts.js';

function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return !(error instanceof Error && 'code' in error && error.code === 'ESRCH'); }
}

async function lostRun(app: ReturnType<typeof createApp>, pid: number) {
  const project = app.service.createProject('失联执行');
  const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 16, timeoutMs: 30000 };
  const run = app.service.submit(project.id, 'orphan', `orphan-${pid}`, 'pi', policy, [], undefined, { view: 'project' }).run;
  app.service.transition(run.id, 'running');
  const running = app.store.get<Run>('run', run.id);
  app.store.update<Run>('run', running.id, running.revision, { startedAt: new Date().toISOString(), leaseUntil: 0, workerPid: pid, calls: 0, reservedUsd: 0, spentUsd: 0 });
  app.scheduler.tick();
  const deadline = Date.now() + 15000;
  let current = app.store.get<Run>('run', run.id);
  while (current.status !== 'interrupted' && Date.now() < deadline) { await delay(50); current = app.store.get<Run>('run', run.id); }
  return current;
}

test('a restarted host stops an orphaned worker and leaves an unrelated pid running', { timeout: 40000, skip: process.platform !== 'win32' }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-orphan', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 1, budgetUsd: 0, reservePerCallUsd: 0 });
  const root = mkdtempSync(join(tmpdir(), 'pi-orphan-'));
  const app = createApp({ dataDir: join(root, 'data'), password: 'orphan-password', schedule: false });
  const worker = spawn(process.execPath, ['--import', 'tsx', resolve('server/worker.ts')], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' });
  const decoy = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  const stop = (child: ChildProcess) => { if (child.pid && alive(child.pid)) child.kill(); };
  try {
    assert.ok(worker.pid);
    assert.ok(decoy.pid);
    const owned = await lostRun(app, worker.pid);
    assert.equal(owned.status, 'interrupted');
    assert.match(owned.error ?? '', /执行失联/);
    const gone = Date.now() + 8000;
    while (alive(worker.pid) && Date.now() < gone) await delay(50);
    assert.equal(alive(worker.pid), false);
    const unrelated = await lostRun(app, decoy.pid);
    assert.equal(unrelated.status, 'interrupted');
    assert.equal(alive(decoy.pid), true);
    assert.throws(() => app.service.retry(owned.id, 'before-ack'), /对账/);
  } finally {
    stop(worker);
    stop(decoy);
    await app.close();
    Object.assign(config, before);
  }
});

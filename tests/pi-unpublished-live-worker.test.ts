import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
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

test('restart keeps an unpublished copy while its worker is alive, then removes it after that worker stops', { timeout: 40000, skip: process.platform !== 'win32' }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-unpublished-live', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 1, budgetUsd: 0, reservePerCallUsd: 0 });
  const root = mkdtempSync(join(tmpdir(), 'unpublished-live-'));
  const data = join(root, 'data');
  const worker = spawn(process.execPath, ['--import', 'tsx', resolve('server/worker.ts')], { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' });
  const decoy = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  const stop = (child: ChildProcess) => { if (child.pid && alive(child.pid)) child.kill(); };
  let reopened: ReturnType<typeof createApp> | undefined;
  try {
    assert.ok(worker.pid);
    const app = createApp({ dataDir: data, password: 'unpublished-live', schedule: false });
    try {
      const project = app.service.createProject('未绑定副本');
      const dir = join(data, 'sessions', project.id);
      mkdirSync(dir, { recursive: true });
      const copy = join(dir, 'pending.jsonl');
      writeFileSync(copy, 'PENDING_COPY\n');
      writeFileSync(`${copy}.unpublished`, '1');
      const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 16, timeoutMs: 30000 };
      const run = app.service.submit(project.id, 'pending', 'pending-copy', 'pi', policy, [], undefined, { view: 'project' }).run;
      app.service.transition(run.id, 'running');
      const running = app.store.get<Run>('run', run.id);
      app.store.update<Run>('run', running.id, running.revision, { startedAt: new Date().toISOString(), leaseUntil: 0, workerPid: worker.pid, calls: 0, reservedUsd: 0, spentUsd: 0 });
    } finally { await app.close(); }
    reopened = createApp({ dataDir: data, password: 'unpublished-live', schedule: false });
    const projectId = reopened.store.list<import('../shared/contracts.js').Entity>('project')[0].id;
    const copy = join(data, 'sessions', projectId, 'pending.jsonl');
    assert.equal(existsSync(copy), true);
    assert.equal(existsSync(`${copy}.unpublished`), true);
    reopened.scheduler.tick();
    const deadline = Date.now() + 15000;
    let current = reopened.store.list<Run>('run').find(item => item.workerPid === worker.pid)!;
    while ((current.status !== 'interrupted' || existsSync(copy)) && Date.now() < deadline) {
      await delay(50);
      current = reopened.store.get<Run>('run', current.id);
    }
    assert.equal(current.status, 'interrupted');
    assert.equal(alive(worker.pid), false);
    assert.equal(existsSync(copy), false);
    assert.equal(existsSync(`${copy}.unpublished`), false);
    assert.ok(decoy.pid);
    const other = join(data, 'sessions', projectId, 'other.jsonl');
    writeFileSync(other, 'OTHER_COPY\n');
    writeFileSync(`${other}.unpublished`, '1');
    const again = reopened.service.submit(projectId, 'other', 'other-copy', 'pi', reopened.store.get<Run>('run', current.id).policy, [], undefined, { view: 'project' }).run;
    reopened.service.transition(again.id, 'running');
    const live = reopened.store.get<Run>('run', again.id);
    reopened.store.update<Run>('run', live.id, live.revision, { startedAt: new Date().toISOString(), leaseUntil: 0, workerPid: decoy.pid, calls: 0, reservedUsd: 0, spentUsd: 0 });
    reopened.scheduler.tick();
    const otherDeadline = Date.now() + 15000;
    let unrelated = reopened.store.get<Run>('run', again.id);
    while ((unrelated.status !== 'interrupted' || existsSync(other)) && Date.now() < otherDeadline) {
      await delay(50);
      unrelated = reopened.store.get<Run>('run', again.id);
    }
    assert.equal(unrelated.status, 'interrupted');
    assert.equal(alive(decoy.pid), true);
    assert.equal(existsSync(other), false);
  } finally {
    stop(worker);
    stop(decoy);
    if (reopened) await reopened.close();
    Object.assign(config, before);
  }
});

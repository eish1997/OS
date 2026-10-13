import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createApp } from '../server/app.js';
import { AppError, Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import type { Run, Policy } from '../shared/contracts.js';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 10000) { const deadline = Date.now() + timeout; while (!fn() && Date.now() < deadline) await delay(20); assert(fn(), 'deadline exceeded'); }
const pol = (projectId: string): Policy => ({ version: 1, projectId, allowModel: false, toolNames: ['write_asset', 'read_asset', 'search_memory', 'create_draft'], maxCalls: 0, maxCostUsd: 0, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 120000 });
test('actual worker cancellation distinguishes request from stop and leaves no owned process', async () => {
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), '取消 test ')), password: 'local', schedule: true });
  try {
    const p = app.service.createProject('A'); const run = app.service.submit(p.id, 'fixture cancellation', 'cancel', 'fixture', pol(p.id)).run;
    await until(() => app.store.get<Run>('run', run.id).status === 'running'); const requested = app.service.cancel(run.id); assert.equal(requested.status, 'running'); assert(requested.cancelRequested);
    await until(() => app.store.get<Run>('run', run.id).status === 'cancelled'); assert.equal(app.snapshot().assets.length, 0);
    const pid = app.store.get<Run>('run', run.id).workerPid!; await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  } finally { await app.close(); }
});
test('owned worker crash blocks dispatch until reconciliation and retry creates a new Run', async () => {
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), '崩溃 test ')), password: 'local', schedule: true });
  try {
    const p = app.service.createProject('A'); const first = app.service.submit(p.id, 'fixture', 'crash', 'fixture', pol(p.id)).run;
    await until(() => app.store.get<Run>('run', first.id).status === 'running'); assert(app.scheduler.terminateOwnedWorker(first.id)); await until(() => app.store.get<Run>('run', first.id).status === 'interrupted');
    const second = app.service.submit(p.id, 'fixture', 'queued', 'fixture', pol(p.id)).run; app.scheduler.tick(); assert.equal(app.store.get<Run>('run', second.id).status, 'queued'); assert.throws(() => app.service.retry(first.id, 'tooearly'));
    app.scheduler.acknowledge(first.id); const retried = app.service.retry(first.id, 'after-reconcile'); assert.notEqual(retried.id, first.id); assert.equal(retried.parentRunId, first.id); assert.equal(retried.attempt, 2); app.service.cancel(second.id); app.service.cancel(retried.id);
  } finally { await app.close(); }
});
test('real controlled HTTP write with lost response remains unknown and is never repeated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unknown HTTP ')); const store = new Store(join(dir, 'workbench.sqlite')); const service = new Service(store, new Assets(store, dir)); let written = 0;
  const endpoint = createServer((req, res) => { written++; req.resume(); res.socket!.destroy(); }); await new Promise<void>(r => endpoint.listen(0, '127.0.0.1', () => r()));
  try {
    const p = service.createProject('A'); const run = service.submit(p.id, 'controlled write', 'external', 'fixture', { ...pol(p.id), toolNames: ['controlled_fault_write'] }).run; service.transition(run.id, 'running');
    const url = `http://127.0.0.1:${(endpoint.address() as { port: number }).port}`;
    const action = () => fetch(url, { method: 'POST', body: 'fixed trusted test content' });
    await assert.rejects(service.executeOperation(run.id, 'write-once', 'controlled_fault_write', {}, action)); assert.equal(written, 1);
    await assert.rejects(service.executeOperation(run.id, 'write-once', 'controlled_fault_write', {}, action), (e: unknown) => e instanceof AppError && e.status === 409); assert.equal(written, 1);
    assert.equal((store.list('operation')[0] as unknown as { state: string }).state, 'unknown');
  } finally { endpoint.closeAllConnections(); await new Promise<void>(r => endpoint.close(() => r())); store.close(); }
});

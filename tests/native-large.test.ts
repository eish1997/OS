import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, openSync, writeSync, closeSync, appendFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fork } from 'node:child_process';
import { prepareNative, cachedNative } from '../server/native-inspection-async.js';
import { scanNative, nativeSessionMaximum } from '../server/native-inspection.js';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Run, Policy, Project } from '../shared/contracts.js';
import { loadPi } from '../server/pi-adapter.js';
import { StorageCapacity } from '../server/storage.js';
import { guardSessionPersistence } from '../server/session-capacity.js';

function history(mebibytes: number) {
  const root = mkdtempSync(join(tmpdir(), 'large-native-')); const projectId = randomUUID(); const sessionId = randomUUID();
  const folder = join(root, 'sessions', projectId); mkdirSync(folder, { recursive: true }); const path = join(folder, 'history.jsonl');
  const fd = openSync(path, 'w'); let size = 0; let count = 0;
  try {
    size += writeSync(fd, JSON.stringify({ type: 'session', version: 3, id: sessionId, cwd: root, timestamp: new Date().toISOString() }) + '\n');
    while (size < mebibytes * 1024 * 1024) {
      const id = `entry-${count}`;
      size += writeSync(fd, JSON.stringify({ type: 'message', id, parentId: count ? `entry-${count - 1}` : null, timestamp: new Date().toISOString(), message: { role: 'user', content: 'large-history-MARKER '.repeat(800), timestamp: Date.now() } }) + '\n'); count++;
    }
  } finally { closeSync(fd); }
  return { root, projectId, sessionId, path, count, size };
}

test('3, 32 and 127 MiB histories validate off-thread while HTTP remains responsive', { timeout: 60000 }, async () => {
  const server = createServer((_req, res) => res.end('ready')); await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; const results = [];
  try {
    for (const size of [3, 32, 127]) {
      const input = history(size); const start = performance.now(); let finished = false;
      const pending = prepareNative(input).finally(() => { finished = true; });
      const latencies: number[] = [];
      while (!finished) { const at = performance.now(); assert.equal(await (await fetch(base)).text(), 'ready'); latencies.push(performance.now() - at); await new Promise(resolve => setTimeout(resolve, 10)); }
      const result = await pending;
      assert.equal(result.bytes, input.size); assert.equal(result.entryCount, input.count); assert.equal(result.sha256, scanNative(input).sha256);
      assert(latencies.length > 0); assert(Math.max(...latencies) < 1000, 'main thread health requests must not stall during validation');
      assert.equal(cachedNative(input)?.sha256, result.sha256);
      results.push({ sizeMiB: size, bytes: result.bytes, elapsedMs: performance.now() - start, maxHttpMs: Math.max(...latencies), healthRequests: latencies.length, workerPeakRss: result.workerPeakRss });
      appendFileSync(input.path, '\n'); assert.equal(cachedNative(input), undefined);
    }
    mkdirSync('output/dev-evidence/pi-parity/large-history', { recursive: true });
    writeFileSync('output/dev-evidence/pi-parity/large-history/inspection.json', JSON.stringify(results, null, 2));
  } finally { await new Promise<void>(done => server.close(() => done())); }
});

test('cancellation stops inspection and corruption or over-limit input never populates the cache', async () => {
  const input = history(3); const controller = new AbortController();
  const pending = prepareNative(input, controller.signal); controller.abort();
  await assert.rejects(pending); assert.equal(cachedNative(input), undefined);
  appendFileSync(input.path, '{broken\n'); await assert.rejects(prepareNative(input)); assert.equal(cachedNative(input), undefined);
  const over = history(0); const fd = openSync(over.path, 'r+');
  try { writeSync(fd, Buffer.from('x'), 0, 1, nativeSessionMaximum); } finally { closeSync(fd); }
  await assert.rejects(prepareNative(over), /128 MiB/);
});

test('real task HTTP preflight accepts 32 MiB continuation while health remains responsive', { timeout: 30000 }, async () => {
  const input = history(32); const previous = { ...config };
  Object.assign(config, { apiKey: 'offline-preflight', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 2, budgetUsd: 20, reservePerCallUsd: 10 });
  const app = createApp({ dataDir: input.root, password: 'large-preflight', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    app.store.create<Project>('project', { id: input.projectId, name: 'large fixture', description: '', archived: false });
    const policy: Policy = { version: 8, projectId: input.projectId, modelBinding: app.modelAccess.settings().binding, allowModel: true, maxCalls: 2, maxCostUsd: 20, reservePerCallUsd: 10, maxOutputTokens: 2048, timeoutMs: 30000, toolNames: [] };
    let source = app.service.submit(input.projectId, 'source', 'source', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(source.id, 'running'); source = app.store.get<Run>('run', source.id);
    app.store.update<Run>('run', source.id, source.revision, { sessionId: input.sessionId, sessionPath: input.path }); app.service.transition(source.id, 'completed');
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'large-preflight' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    let finished = false; const latencies: number[] = [];
    const pending = fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ projectId: input.projectId, goal: 'continue', commandId: 'large-continue', continueFromRunId: source.id }) }).finally(() => { finished = true; });
    while (!finished) { const at = performance.now(); assert.equal((await (await fetch(base + '/api/health')).json()).ready, true); latencies.push(performance.now() - at); await new Promise(resolve => setTimeout(resolve, 10)); }
    const accepted = await pending; assert.equal(accepted.status, 202, await accepted.clone().text());
    const value = await accepted.json(); assert.equal(value.run.continuation.runId, source.id); assert.equal(value.run.status, 'queued');
    assert(latencies.length > 1); assert(Math.max(...latencies) < 1000);
    // Invalidate preflight metadata so dispatch must prepare again, then stop it before any model worker starts.
    appendFileSync(input.path, '\n'); app.scheduler.tick();
    assert.equal(app.scheduler.pluginMaintenanceBlocked(), true);
    app.service.cancel(value.run.id); await app.scheduler.stop();
    const cancelled = app.store.get<Run>('run', value.run.id);
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.calls, 0); assert.equal(cancelled.workerPid, undefined);
    assert.equal(app.scheduler.pluginMaintenanceBlocked(), false);
    writeFileSync('output/dev-evidence/pi-parity/large-history/http.json', JSON.stringify({ bytes: input.size, healthRequests: latencies.length, maxHttpMs: Math.max(...latencies), accepted: true }, null, 2));
  } finally { await app.close(); Object.assign(config, previous); }
});

test('32 and 127 MiB native SDK forks preserve source and reopen after clean backup restore', { timeout: 120000 }, async () => {
  const results = [];
  const server = createServer((_req, res) => res.end('ready')); await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const size of [32, 127]) {
      const input = history(size);
      appendFileSync(input.path, JSON.stringify({ type: 'compaction', id: 'compaction-fixture', parentId: `entry-${input.count - 1}`, timestamp: new Date().toISOString(), summary: 'Preserve MARKER and original objective.', firstKeptEntryId: `entry-${input.count - 2}`, tokensBefore: size * 250000 }) + '\n');
      const child = fork('tests/helpers/large-native-fork.ts', [], { execArgv: ['--max-old-space-size=1536', '--import', 'tsx'], windowsHide: true, stdio: ['ignore','ignore','pipe','ipc'] });
      let result: Record<string, unknown> | undefined; let error = ''; let done = false;
      child.stderr?.on('data', chunk => { error = (error + chunk).slice(-4000); });
      const pending = new Promise<void>((resolve, reject) => {
        child.on('message', (message: { result?: Record<string, unknown>; error?: string }) => { result = message.result; if (message.error) error += message.error; });
        child.once('error', reject); child.once('close', code => { done = true; code === 0 && result ? resolve() : reject(new Error(error || `fork helper exited ${code}`)); });
      });
      child.send(input); const latencies = [];
      try {
        while (!done) { const at = performance.now(); assert.equal(await (await fetch(base)).text(), 'ready'); latencies.push(performance.now() - at); await new Promise(resolve => setTimeout(resolve, 20)); }
        await pending;
      } finally { if (child.exitCode === null) child.kill(); }
      assert(Math.max(...latencies) < 1000);
      results.push({ sizeMiB: size, ...result, maxHttpMs: Math.max(...latencies), healthRequests: latencies.length });
    }
    mkdirSync('output/dev-evidence/pi-parity/large-history', { recursive: true });
    writeFileSync('output/dev-evidence/pi-parity/large-history/fork-restore.json', JSON.stringify(results, null, 2));
  } finally { await new Promise<void>(done => server.close(() => done())); }
});

test('a single 127 MiB JSONL record validates without lowering the accepted file limit', { timeout: 30000 }, async () => {
  const input = history(0); const fd = openSync(input.path, 'a');
  try {
    writeSync(fd, '{"type":"message","id":"large-record","parentId":null,"message":{"role":"user","content":"');
    const chunk = Buffer.alloc(1024 * 1024, 65);
    for (let i = 0; i < 127; i++) writeSync(fd, chunk);
    writeSync(fd, '","timestamp":1}}\n');
  } finally { closeSync(fd); }
  const result = await prepareNative(input); assert.equal(result.entryCount, 1); assert(result.bytes < nativeSessionMaximum);
  writeFileSync('output/dev-evidence/pi-parity/large-history/single-record.json', JSON.stringify({ bytes: result.bytes, workerPeakRss: result.workerPeakRss, accepted: true }, null, 2));
});

test('session append refuses growth past the same 128 MiB limit before changing disk bytes', async () => {
  const input = history(0); const pi = await loadPi(); const cwd = join(input.root, 'workspaces', input.projectId); mkdirSync(cwd, { recursive: true });
  const manager = pi.SessionManager.create(cwd, join(input.root, 'sessions', input.projectId));
  manager.appendMessage({ role: 'user', content: 'persist fixture', timestamp: Date.now() });
  const path = manager.getSessionFile()!; const fd = openSync(path, 'a');
  try {
    // Trailing JSON whitespace is valid and makes the disk-boundary fixture cheap to construct.
    let remaining = nativeSessionMaximum - 128 - statSync(path).size; const chunk = Buffer.alloc(1024 * 1024, 32);
    while (remaining > 0) { const n = Math.min(remaining, chunk.length); writeSync(fd, chunk, 0, n); remaining -= n; }
  } finally { closeSync(fd); }
  const before = statSync(path).size;
  const guarded = guardSessionPersistence(manager, new StorageCapacity(input.root, { sessionsBytes: 512 * 1024 * 1024, minFreeBytes: 0 }));
  assert.throws(() => manager.appendMessage({ role: 'user', content: 'must not append '.repeat(100), timestamp: Date.now() }), /128 MiB/);
  assert.equal(statSync(path).size, before); assert.throws(() => guarded.assertHealthy(), /128 MiB/);
});

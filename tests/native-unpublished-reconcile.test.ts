import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { reconcileUnpublishedSessions, rewriteForkInPlace, releasePublishedSession } from '../server/native-session.js';
import type { Policy, Run } from '../shared/contracts.js';

test('restart drops an unfinished fork copy and keeps a session already bound to a run', async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-unpublished', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 1, budgetUsd: 0, reservePerCallUsd: 0 });
  const data = mkdtempSync(join(tmpdir(), 'unpublished-'));
  const app = createApp({ dataDir: data, password: 'unpublished-password', schedule: false });
  try {
    const project = app.service.createProject('未完成副本');
    const dir = join(data, 'sessions', project.id);
    mkdirSync(dir, { recursive: true });
    const orphan = join(dir, 'orphan.jsonl');
    const kept = join(dir, 'kept.jsonl');
    writeFileSync(orphan, '{"type":"session"}\n');
    writeFileSync(`${orphan}.unpublished`, '1');
    writeFileSync(kept, 'KEPT_SESSION\n');
    writeFileSync(`${kept}.unpublished`, '1');
    writeFileSync(`${kept}.readable`, 'partial');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 16, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'keep', 'keep-copy', 'pi', policy, [], undefined, { view: 'project' }).run;
    app.store.update<Run>('run', run.id, app.store.get<Run>('run', run.id).revision, { sessionPath: kept, sessionId: 'kept' });
  } finally { await app.close(); Object.assign(config, before); }
  const reopened = createApp({ dataDir: data, password: 'unpublished-password', schedule: false });
  try {
    const dir = readdirSync(join(data, 'sessions'))[0];
    const names = readdirSync(join(data, 'sessions', dir));
    assert.equal(names.includes('orphan.jsonl'), false);
    assert.equal(names.includes('orphan.jsonl.unpublished'), false);
    assert.equal(names.includes('kept.jsonl.unpublished'), false);
    assert.equal(names.includes('kept.jsonl.readable'), false);
    assert.equal(readFileSync(join(data, 'sessions', dir, 'kept.jsonl'), 'utf8'), 'KEPT_SESSION\n');
  } finally { await reopened.close(); }
});

test('a killed rewrite leaves a marker and the next open removes that copy only', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'rewrite-kill-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('Rewrite');
  const cwd = join(root, 'workspaces', project.id);
  const sessionDir = join(root, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const pi = await loadPi();
  const manager = pi.SessionManager.create(cwd, sessionDir);
  manager.appendMessage({ role: 'user', content: 'SOURCE_ANCHOR ' + 'x'.repeat(4000), timestamp: 1 });
  const source = manager.getSessionFile()!;
  const sourceBytes = readFileSync(source);
  const copy = join(sessionDir, 'copy.jsonl');
  copyFileSync(source, copy);
  const header = JSON.parse(readFileSync(copy, 'utf8').split('\n')[0]) as { id: string };
  const progress = join(sessionDir, 'progress.txt');
  const helper = fileURLToPath(new URL('./helpers/rewrite-midwrite-child.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', helper, copy, header.id], { env: { ...process.env, PI_REWRITE_YIELD_MS: '80', PI_REWRITE_PROGRESS: progress, PI_OFFLINE: '1' }, stdio: 'ignore', windowsHide: true, cwd: process.cwd() });
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !existsSync(progress)) await delay(20);
    assert.equal(existsSync(progress), true);
    child.kill('SIGKILL');
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
    assert.equal(existsSync(`${copy}.unpublished`), true);
    assert.deepEqual(readFileSync(source), sourceBytes);
    reconcileUnpublishedSessions(store);
    assert.equal(existsSync(copy), false);
    assert.equal(existsSync(`${copy}.unpublished`), false);
    assert.deepEqual(readFileSync(source), sourceBytes);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await service.assets.searchIndex.close();
    store.close();
  }
});

test('a finished rewrite keeps its marker until the session path is recorded', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rewrite-bound-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('Bound');
  const cwd = join(root, 'workspaces', project.id);
  const sessionDir = join(root, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const pi = await loadPi();
  const manager = pi.SessionManager.create(cwd, sessionDir);
  manager.appendMessage({ role: 'user', content: 'FINISHED_ANCHOR', timestamp: 1 });
  const source = manager.getSessionFile()!;
  const sourceBytes = readFileSync(source);
  const unbound = join(sessionDir, 'unbound.jsonl');
  const bound = join(sessionDir, 'bound.jsonl');
  copyFileSync(source, unbound);
  copyFileSync(source, bound);
  const header = JSON.parse(readFileSync(source, 'utf8').split('\n')[0]) as { id: string };
  rewriteForkInPlace(unbound, header.id);
  rewriteForkInPlace(bound, header.id);
  const outside = join(root, 'outside.jsonl');
  writeFileSync(outside, 'OUTSIDE\n');
  writeFileSync(`${outside}.unpublished`, '1');
  try {
    assert.equal(existsSync(`${unbound}.unpublished`), true);
    assert.equal(existsSync(`${bound}.unpublished`), true);
    assert.equal(readFileSync(unbound, 'utf8').includes('FINISHED_ANCHOR'), true);
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: false, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 16, timeoutMs: 30000 };
    const run = service.submit(project.id, 'bind', 'bind-copy', 'fixture', policy, [], undefined, { view: 'project' }).run;
    store.update<Run>('run', run.id, store.get<Run>('run', run.id).revision, { sessionPath: bound, sessionId: header.id });
    releasePublishedSession(outside, sessionDir);
    assert.equal(existsSync(`${outside}.unpublished`), true);
    releasePublishedSession(bound, sessionDir);
    assert.equal(existsSync(bound), true);
    assert.equal(existsSync(`${bound}.unpublished`), false);
    assert.equal(readFileSync(bound, 'utf8').includes('FINISHED_ANCHOR'), true);
    reconcileUnpublishedSessions(store);
    assert.equal(existsSync(unbound), false);
    assert.equal(existsSync(`${unbound}.unpublished`), false);
    assert.equal(readFileSync(bound, 'utf8').includes('FINISHED_ANCHOR'), true);
    assert.deepEqual(readFileSync(source), sourceBytes);
  } finally {
    await service.assets.searchIndex.close();
    store.close();
  }
});

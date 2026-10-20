import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, AppError } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { loadPi } from '../server/pi-adapter.js';
import { StorageCapacity } from '../server/storage.js';
import { continuationFor, forkNative } from '../server/native-session.js';
import { scanNative } from '../server/native-inspection.js';
import type { Policy, Run } from '../shared/contracts.js';

async function session() {
  const root = mkdtempSync(join(tmpdir(), 'native-mid-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('Mid');
  const policy: Policy = { version: 5, projectId: project.id, modelBinding: { kind: 'chatgpt', provider: 'openai', model: 'gpt-5.6-sol', connectionId: 'offline' }, allowModel: true, maxCalls: 2, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 256, timeoutMs: 300000, toolNames: ['write_asset'] };
  const cwd = join(root, 'workspaces', project.id);
  const sessionDir = join(root, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const pi = await loadPi();
  const manager = pi.SessionManager.create(cwd, sessionDir);
  manager.appendMessage({ role: 'user', content: 'BEFORE_GAP', timestamp: 1 });
  manager.appendMessage({ role: 'user', content: 'AFTER_GAP', timestamp: 2 });
  const run = service.submit(project.id, 'mid', 'mid', 'pi', policy).run;
  const path = manager.getSessionFile()!;
  store.update<Run>('run', run.id, run.revision, { sessionId: manager.getSessionId(), sessionPath: path, status: 'completed' });
  return { root, store, service, project, policy, cwd, sessionDir, pi, path, run };
}

function insertBeforeAfter(path: string, line: string) {
  const original = readFileSync(path);
  const text = original.toString('utf8');
  const marker = text.indexOf('AFTER_GAP');
  assert.ok(marker > 0);
  const lineStart = text.lastIndexOf('\n', marker) + 1;
  const next = Buffer.concat([original.subarray(0, lineStart), Buffer.from(line), original.subarray(lineStart)]);
  writeFileSync(path, next);
  return next;
}

test('a complete damaged line between valid entries rejects the whole session', async () => {
  const q = await session();
  try {
    const damaged = insertBeforeAfter(q.path, '{"type":"message","id":"BROKEN"\n');
    const input = { path: q.path, sessionId: q.store.get<Run>('run', q.run.id).sessionId!, root: q.root, projectId: q.project.id };
    assert.throws(() => scanNative(input), (error: unknown) => error instanceof AppError && error.status === 422);
    assert.throws(() => continuationFor(q.store, q.project.id, q.policy, q.run.id), (error: unknown) => error instanceof AppError && error.status === 422);
    assert.throws(() => forkNative(q.pi, q.path, { runId: q.run.id, sessionId: input.sessionId, sha256: '0'.repeat(64) }, q.project.id, q.cwd, q.sessionDir, new StorageCapacity(q.root, { minFreeBytes: 0 })), (error: unknown) => error instanceof AppError && error.status === 422);
    assert.deepEqual(readFileSync(q.path), damaged);
    assert.equal(readdirSync(q.sessionDir).some(name => name.endsWith('.readable')), false);
    assert.equal(readdirSync(q.sessionDir).filter(name => name.endsWith('.jsonl')).length, 1);
  } finally {
    await q.service.assets.searchIndex.close();
    q.store.close();
  }
});

test('invalid UTF-8 inside a middle line rejects the whole session', async () => {
  const q = await session();
  try {
    const original = readFileSync(q.path);
    const marker = original.indexOf('AFTER_GAP');
    const damaged = Buffer.from(original);
    damaged[marker - 2] = 0xff;
    writeFileSync(q.path, damaged);
    assert.throws(() => scanNative({ path: q.path, sessionId: q.store.get<Run>('run', q.run.id).sessionId!, root: q.root, projectId: q.project.id }), (error: unknown) => error instanceof AppError && error.status === 422 && error.message.includes('UTF-8'));
    assert.deepEqual(readFileSync(q.path), damaged);
  } finally {
    await q.service.assets.searchIndex.close();
    q.store.close();
  }
});

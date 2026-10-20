import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
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
  const root = mkdtempSync(join(tmpdir(), 'native-torn-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('Torn');
  const policy: Policy = { version: 5, projectId: project.id, modelBinding: { kind: 'chatgpt', provider: 'openai', model: 'gpt-5.6-sol', connectionId: 'offline' }, allowModel: true, maxCalls: 2, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 256, timeoutMs: 300000, toolNames: ['write_asset'] };
  const cwd = join(root, 'workspaces', project.id);
  const sessionDir = join(root, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const pi = await loadPi();
  const manager = pi.SessionManager.create(cwd, sessionDir);
  manager.appendMessage({ role: 'user', content: 'COMPLETE_ENTRY', timestamp: 1 });
  const run = service.submit(project.id, 'torn', 'torn', 'pi', policy).run;
  const path = manager.getSessionFile()!;
  store.update<Run>('run', run.id, run.revision, { sessionId: manager.getSessionId(), sessionPath: path, status: 'completed' });
  return { root, store, service, project, policy, cwd, sessionDir, pi, path, run };
}

test('a torn session tail stays on the original and continuation keeps the complete prefix', async () => {
  const q = await session();
  try {
    appendFileSync(q.path, '{"type":"message","id":"TORN');
    const original = readFileSync(q.path);
    const scanned = scanNative({ path: q.path, sessionId: q.store.get<Run>('run', q.run.id).sessionId!, root: q.root, projectId: q.project.id });
    assert.ok((scanned.tornTailBytes ?? 0) > 0);
    assert.equal(scanned.bytes, original.length);
    const continuation = continuationFor(q.store, q.project.id, q.policy, q.run.id)!;
    const fork = forkNative(q.pi, q.path, continuation, q.project.id, q.cwd, q.sessionDir, new StorageCapacity(q.root, { minFreeBytes: 0 }));
    const context = JSON.stringify(fork.buildSessionContext().messages);
    assert.match(context, /COMPLETE_ENTRY/);
    assert.doesNotMatch(context, /TORN/);
    assert.deepEqual(readFileSync(q.path), original);
    assert.equal(readdirSync(q.sessionDir).some(name => name.endsWith('.readable')), false);
    const broken = appendFileSync(q.path, '\nbad json\n');
    void broken;
    assert.throws(() => scanNative({ path: q.path, sessionId: q.store.get<Run>('run', q.run.id).sessionId!, root: q.root, projectId: q.project.id }), (error: unknown) => error instanceof AppError && error.status === 422);
    assert.deepEqual(readFileSync(q.path), Buffer.concat([original, Buffer.from('\nbad json\n')]));
  } finally {
    await q.service.assets.searchIndex.close();
    q.store.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { loadPi } from '../server/pi-adapter.js';
import { StorageCapacity } from '../server/storage.js';
import { continuationFor, forkNative } from '../server/native-session.js';
import { scanNative } from '../server/native-inspection.js';
import { inspectNativeImport } from '../server/native-import-inspection.js';
import type { Policy, Run } from '../shared/contracts.js';

test('pinned Pi metadata entries scan, import-check, and fork without dropping the user text', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-meta-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('Meta');
  const policy: Policy = { version: 5, projectId: project.id, modelBinding: { kind: 'chatgpt', provider: 'openai', model: 'gpt-5.6-sol', connectionId: 'offline' }, allowModel: true, maxCalls: 1, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 32, timeoutMs: 30000, toolNames: [] };
  const cwd = join(root, 'workspaces', project.id);
  const sessionDir = join(root, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const pi = await loadPi();
  const manager = pi.SessionManager.create(cwd, sessionDir);
  const userId = manager.appendMessage({ role: 'user', content: 'META_USER', timestamp: 1 });
  manager.appendThinkingLevelChange('medium');
  manager.appendModelChange('openai', 'gpt-5.6-sol');
  manager.appendUsage('agent', 'openai', 'gpt-5.6-sol', { input: 3, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 4, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
  manager.appendCustomEntry('workbench_note', { marker: 'CUSTOM_OK' });
  manager.appendSessionInfo('元数据会话');
  manager.appendLabelChange(userId, 'bookmark');
  manager.appendCustomMessageEntry('host_note', 'CUSTOM_MESSAGE', false, {});
  const run = service.submit(project.id, 'meta', 'meta', 'pi', policy).run;
  const path = manager.getSessionFile()!;
  const original = readFileSync(path);
  store.update<Run>('run', run.id, run.revision, { sessionId: manager.getSessionId(), sessionPath: path, status: 'completed' });
  try {
    const scanned = scanNative({ path, sessionId: manager.getSessionId(), root, projectId: project.id });
    assert.equal(scanned.entryCount, manager.getEntries().length);
    const preview = inspectNativeImport({ path, root, projectId: project.id });
    assert.equal(preview.customEntryCount, 2);
    assert.equal(preview.lastRecordedModel?.model, 'gpt-5.6-sol');
    const continuation = continuationFor(store, project.id, policy, run.id)!;
    const fork = forkNative(pi, path, continuation, project.id, cwd, sessionDir, new StorageCapacity(root, { minFreeBytes: 0 }));
    const reopened = pi.SessionManager.open(fork.getSessionFile()!, sessionDir, cwd);
    assert.match(JSON.stringify(reopened.buildSessionContext().messages), /META_USER/);
    assert.equal(reopened.getEntries().some(entry => entry.type === 'model_change'), true);
    assert.deepEqual(readFileSync(path), original);
  } finally {
    await service.assets.searchIndex.close();
    store.close();
  }
});

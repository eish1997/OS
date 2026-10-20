import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { loadPi } from '../server/pi-adapter.js';
import { StorageCapacity } from '../server/storage.js';
import { continuationFor, forkNative } from '../server/native-session.js';
import { scanNative } from '../server/native-inspection.js';
import type { Policy, Run } from '../shared/contracts.js';

test('killing Pi during a session append keeps the anchor and continues from the complete prefix', { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-append-kill-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('Append kill');
  const policy: Policy = { version: 5, projectId: project.id, modelBinding: { kind: 'chatgpt', provider: 'openai', model: 'gpt-5.6-sol', connectionId: 'offline' }, allowModel: true, maxCalls: 2, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 256, timeoutMs: 300000, toolNames: ['write_asset'] };
  const cwd = join(root, 'workspaces', project.id);
  const sessionDir = join(root, 'sessions', project.id);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const progress = join(root, 'progress.json');
  const helper = fileURLToPath(new URL('./helpers/pi-append-kill-child.ts', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', helper, cwd, sessionDir, progress], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  try {
    await once(child, 'exit');
    assert.equal(existsSync(progress + '.finished'), false, stderr);
    const marker = JSON.parse(readFileSync(progress, 'utf8')) as { file: string; sessionId: string; anchorBytes: number };
    const original = readFileSync(marker.file);
    assert.ok(original.length > marker.anchorBytes);
    assert.equal(original.subarray(0, marker.anchorBytes).toString('utf8').includes('PI_ANCHOR'), true);
    const run = service.submit(project.id, 'append-kill', 'append-kill', 'pi', policy).run;
    store.update<Run>('run', run.id, run.revision, { sessionId: marker.sessionId, sessionPath: marker.file, status: 'completed' });
    const scanned = scanNative({ path: marker.file, sessionId: marker.sessionId, root, projectId: project.id });
    assert.equal(scanned.tornTailBytes, original.length - marker.anchorBytes);
    const pi = await loadPi();
    const fork = forkNative(pi, marker.file, continuationFor(store, project.id, policy, run.id)!, project.id, cwd, sessionDir, new StorageCapacity(root, { minFreeBytes: 0 }));
    const context = JSON.stringify(fork.buildSessionContext().messages);
    assert.match(context, /PI_ANCHOR/);
    assert.doesNotMatch(context, /KILL_THIS_ENTRY/);
    assert.deepEqual(readFileSync(marker.file), original);
    assert.equal(existsSync(`${marker.file}.readable`), false);
  } finally {
    await service.assets.searchIndex.close();
    store.close();
  }
});

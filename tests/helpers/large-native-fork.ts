import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { loadPi } from '../../server/pi-adapter.js';
import { scanNative, type NativeInspectionInput } from '../../server/native-inspection.js';
import { forkNative, continuationFor } from '../../server/native-session.js';
import { StorageCapacity } from '../../server/storage.js';
import { Store } from '../../server/store.js';
import { Assets } from '../../server/assets.js';
import { Service } from '../../server/service.js';
import { backup, restore } from '../../server/backup.js';
import type { Policy, Project, Run } from '../../shared/contracts.js';

process.once('message', async (input: NativeInspectionInput) => {
  let store: Store | undefined;
  try {
    const start = performance.now(); const original = scanNative(input);
    const cwd = join(input.root, 'workspaces', input.projectId); mkdirSync(cwd, { recursive: true });
    const pi = await loadPi();
    const branch = forkNative(pi, input.path, { runId: 'source-fixture', sessionId: input.sessionId, sha256: original.sha256 }, input.projectId, cwd, dirname(input.path), new StorageCapacity(input.root, { sessionsBytes: 512 * 1024 * 1024, minFreeBytes: 0 }));
    const forkMs = performance.now() - start;
    const context = branch.buildSessionContext(); assert(context.messages.length <= 4); assert(JSON.stringify(context).includes('MARKER'));
    branch.appendMessage({ role: 'user', content: 'CONTINUE_AFTER_LARGE_HISTORY', timestamp: Date.now() });
    assert.equal(scanNative(input).sha256, original.sha256);
    const branchInput = { ...input, path: branch.getSessionFile()!, sessionId: branch.getSessionId() };
    const checkpoint = scanNative(branchInput);
    const reopened = pi.SessionManager.open(branchInput.path, dirname(branchInput.path), cwd);
    assert(JSON.stringify(reopened.buildSessionContext()).includes('CONTINUE_AFTER_LARGE_HISTORY'));
    store = new Store(join(input.root, 'workbench.sqlite'));
    store.create<Project>('project', { id: input.projectId, name: 'large restore fixture', description: '', archived: false });
    const service = new Service(store, new Assets(store, input.root));
    const policy: Policy = { version: 8, projectId: input.projectId, toolNames: [], allowModel: false, maxCalls: 0, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 1, timeoutMs: 60000 };
    let run = service.submit(input.projectId, 'restore fixture', 'restore-fixture', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    service.transition(run.id, 'running'); run = store.get<Run>('run', run.id);
    store.update<Run>('run', run.id, run.revision, { sessionId: branchInput.sessionId, sessionPath: branchInput.path }); service.transition(run.id, 'completed');
    const archive = input.root + '-archive'; const restoredRoot = input.root + '-restored'; const at = performance.now();
    backup(store, input.root, archive); restore(archive, restoredRoot);
    const recovered = new Store(join(restoredRoot, 'workbench.sqlite'));
    try {
      const ref = continuationFor(recovered, input.projectId, policy, run.id)!; assert.equal(ref.sha256, checkpoint.sha256);
      const restoredRun = recovered.get<Run>('run', run.id);
      const restoredSession = pi.SessionManager.open(restoredRun.sessionPath!, dirname(restoredRun.sessionPath!), join(restoredRoot, 'workspaces', input.projectId));
      assert(JSON.stringify(restoredSession.buildSessionContext()).includes('CONTINUE_AFTER_LARGE_HISTORY'));
    } finally { recovered.close(); }
    store.close(); store = undefined;
    process.send!({ result: { bytes: original.bytes, forkMs, backupRestoreMs: performance.now() - at, elapsedMs: performance.now() - start, peakRss: process.resourceUsage().maxRSS * 1024, sourcePreserved: true, restored: true } }, () => process.disconnect!());
  } catch (error) { store?.close(); process.send!({ error: String(error) }, () => process.disconnect!()); process.exitCode = 1; }
});

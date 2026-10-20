import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('manual compaction summarization retries exhaust without rewriting the source or inventing a zero-cost settle', { timeout: 90000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-compaction-exhaust', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 8, budgetUsd: 80, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-compaction-exhaust-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const attempts = join(root, 'attempts.txt');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-compaction-exhaust', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      globalThis.fetch = async () => {
        appendFileSync(${JSON.stringify(attempts)}, 'request\\n');
        return Response.json({ error: { message: '503 service unavailable RAW_SECRET', type: 'server_error' } }, { status: 503 });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'compaction-exhaust-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'exhaust-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Exhaust transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('摘要重试耗尽');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 8, maxCostUsd: 80, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 60000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'off', thinkingLevel: 'off', autoCompaction: true, autoRetry: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const pi = await loadPi(); const manager = pi.SessionManager.create(cwd, sessions);
    for (let i = 0; i < 6; i++) manager.appendMessage({ role: 'user', content: `FIXED_TOKEN step ${i} ` + 'history '.repeat(8000), timestamp: Date.now() });
    const seeded = app.service.submit(project.id, 'seed', 'seed', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(seeded.id, 'running');
    const current = app.store.get<Run>('run', seeded.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(seeded.id, 'completed');
    const sourceBytes = readFileSync(manager.getSessionFile()!);
    const compact = app.service.submit(project.id, 'manual compaction exhaust', 'compact-exhaust', 'pi', policy, [], undefined, { view: 'project' }, seeded.id, undefined, 'compact').run;
    const deadline = Date.now() + 70000;
    let done = compact;
    let sawRetry = false;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', compact.id);
      if (done.retryState?.source === 'compaction') sawRetry = true;
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(40);
    }
    assert(['failed', 'interrupted'].includes(done.status), done.error ?? done.status);
    assert(sawRetry || done.retryState?.source === 'compaction' || done.calls >= 2, '摘要应走过重试或多次请求');
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(item => item.runId === compact.id);
    assert(receipts.length >= 2, `耗尽应留下多次摘要预留/结算，实际 ${receipts.length}`);
    assert(receipts.every(item => item.purpose === 'compaction'));
    assert(!receipts.some(item => item.state === 'settled' && item.usage?.complete === true), '耗尽不得留下完整成功结算');
    assert(receipts.every(item => item.state === 'unknown' || item.state === 'reserved' || (item.state === 'settled' && item.usage?.complete !== true)));
    const httpAttempts = existsSyncAttempts(attempts);
    assert(httpAttempts >= 2, `外部请求至少两次，实际 ${httpAttempts}`);
    mkdirSync('output/dev-evidence/pi-parity/loop-111', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-111', 'report.json'), JSON.stringify({
      status: done.status,
      calls: done.calls,
      httpAttempts,
      receipts: receipts.map(item => ({ state: item.state, purpose: item.purpose, costUsd: item.costUsd })),
      sourceBytes: sourceBytes.length,
      sawRetry
    }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

function existsSyncAttempts(path: string) {
  try { return readFileSync(path, 'utf8').trim().split(/\n+/).filter(Boolean).length; } catch { return 0; }
}

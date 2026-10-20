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

test('cancelling manual compaction while summarization is waiting to retry keeps the source and does not spend a later attempt', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-compaction-retry-cancel', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 8, budgetUsd: 80, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-compaction-retry-cancel-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const attempts = join(root, 'attempts.txt');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-compaction-retry-cancel', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      globalThis.fetch = async () => {
        appendFileSync(${JSON.stringify(attempts)}, 'request\\n');
        return Response.json({ error: { message: '503 service unavailable RAW_SECRET', type: 'server_error' } }, { status: 503, headers: { 'retry-after': '30' } });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'compaction-retry-cancel-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'retry-cancel-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Retry cancel'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('摘要重试取消');
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
    const compact = app.service.submit(project.id, 'manual compaction cancel retry', 'compact-retry-cancel', 'pi', policy, [], undefined, { view: 'project' }, seeded.id, undefined, 'compact').run;
    const waitDeadline = Date.now() + 20000;
    let waiting = false;
    while (Date.now() < waitDeadline) {
      app.scheduler.tick();
      const run = app.store.get<Run>('run', compact.id);
      if (run.retryState?.source === 'compaction' && run.retryState.phase === 'waiting') { waiting = true; break; }
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) throw new Error(run.error ?? run.status);
      await delay(30);
    }
    assert(waiting, '必须先进入摘要重试等待');
    const beforeCancelAttempts = readFileSync(attempts, 'utf8').trim().split(/\n+/).filter(Boolean).length;
    await app.service.requestCancel(compact.id);
    const doneDeadline = Date.now() + 15000;
    let done = compact;
    while (Date.now() < doneDeadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', compact.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(30);
    }
    assert.equal(done.status, 'cancelled', done.error ?? 'compaction retry cancel');
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    const afterCancelAttempts = readFileSync(attempts, 'utf8').trim().split(/\n+/).filter(Boolean).length;
    assert.equal(afterCancelAttempts, beforeCancelAttempts, '取消后不应再发起摘要 HTTP');
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(item => item.runId === compact.id);
    assert(receipts.length >= 1);
    assert(receipts.every(item => item.purpose === 'compaction'));
    assert(!receipts.some(item => item.state === 'settled' && item.usage?.complete === true));
    mkdirSync('output/dev-evidence/pi-parity/loop-112', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-112', 'report.json'), JSON.stringify({
      status: done.status,
      calls: done.calls,
      httpAttempts: afterCancelAttempts,
      receipts: receipts.map(item => ({ state: item.state, purpose: item.purpose })),
      sourceBytes: sourceBytes.length,
      cancelledDuring: 'compaction-retry-waiting'
    }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

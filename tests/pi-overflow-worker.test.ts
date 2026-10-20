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

test('a production turn recovers from context overflow, accounts the summary, and keeps the source', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-overflow', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 6, budgetUsd: 60, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-overflow-worker-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const summary = 'Recovered MARKER and the original objective.';
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-overflow', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `export default pi => pi.on('session_start', () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) return Response.json({ error: { message: 'maximum context length exceeded RAW_SECRET', code: 'context_length_exceeded' } }, { status: 400 });
      const text = calls === 2 ? ${JSON.stringify(summary)} : 'Continue MARKER after recovery.';
      const item = { id: 'msg-' + calls, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'response-' + calls, status: 'completed', output: [item], usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220, input_tokens_details: { cached_tokens: 0 } } } }
      ];
      return new Response(events.map(event => 'event: ' + event.type + '\\ndata: ' + JSON.stringify(event) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'overflow-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'overflow-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Overflow transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('溢出恢复');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 6, maxCostUsd: 60, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 30000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', autoCompaction: true, autoRetry: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const pi = await loadPi(); const manager = pi.SessionManager.create(cwd, sessions);
    for (let i = 0; i < 6; i++) manager.appendMessage({ role: 'user', content: `MARKER step ${i} ` + 'history '.repeat(8000), timestamp: Date.now() });
    const seeded = app.service.submit(project.id, 'seed', 'seed', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(seeded.id, 'running');
    const current = app.store.get<Run>('run', seeded.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(seeded.id, 'completed');
    const sourceBytes = readFileSync(manager.getSessionFile()!);
    const continued = app.service.submit(project.id, 'Continue MARKER after overflow', 'overflow', 'pi', policy, [], undefined, { view: 'project' }, seeded.id).run;
    const deadline = Date.now() + 25000;
    let done = continued;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', continued.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(40);
    }
    assert.equal(done.status, 'completed', done.error ?? 'overflow recovery');
    assert.equal(done.compaction?.phase, 'completed');
    assert.equal(done.compaction?.reason, 'overflow');
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(receipt => receipt.runId === done.id);
    assert(receipts.some(receipt => receipt.purpose === 'compaction' && receipt.state === 'settled'));
    assert.equal(receipts.at(-1)?.purpose, 'agent');
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    const copied = readFileSync(done.sessionPath!, 'utf8');
    assert(copied.includes('Recovered MARKER'));
    assert(!copied.includes('RAW_SECRET'));
    mkdirSync('output/dev-evidence/pi-parity/overflow-worker', { recursive: true });
    writeFileSync('output/dev-evidence/pi-parity/overflow-worker/report.json', JSON.stringify({ sourceBytes: sourceBytes.length, calls: done.calls, reason: done.compaction?.reason, purposes: receipts.map(receipt => `${receipt.purpose}:${receipt.state}`) }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

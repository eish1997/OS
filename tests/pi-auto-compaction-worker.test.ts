import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('a normal production turn compacts when usage crosses the fixed Pi threshold', { timeout: 60000 }, async () => {
  const pi = await loadPi();
  const runtime = await pi.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false });
  const model = runtime.getModel('openai', 'gpt-5.6-sol');
  assert(model, '固定版本中没有该模型');
  const reportedInput = model.contextWindow - 8000;
  assert(reportedInput > model.contextWindow - 16384);
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-auto-compaction', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-auto-compaction-')); const source = join(root, 'transport'); mkdirSync(source);
  const answer = 'Threshold answer keeps the latest turn.';
  const summary = 'Preserve OLD_CONSTRAINT and continue the original objective.';
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-auto-compaction', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `export default pi => pi.on('session_start', () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      const text = calls === 1 ? ${JSON.stringify(answer)} : ${JSON.stringify(summary)};
      const input = calls === 1 ? ${reportedInput} : 200;
      const item = { id: 'msg-' + calls, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
      const events = [
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'response-' + calls, status: 'completed', output: [item], usage: { input_tokens: input, output_tokens: 20, total_tokens: input + 20, input_tokens_details: { cached_tokens: 0 } } } }
      ];
      return new Response(events.map(event => 'event: ' + event.type + '\\ndata: ' + JSON.stringify(event) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'auto-compaction-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'auto-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Local threshold transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('自动压缩验收');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 15000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', autoCompaction: true, autoRetry: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const manager = pi.SessionManager.create(cwd, sessions);
    for (let i = 0; i < 6; i++) manager.appendMessage({ role: 'user', content: `OLD_CONSTRAINT step ${i} ` + 'history '.repeat(8000), timestamp: Date.now() });
    const original = app.service.submit(project.id, 'seed', 'seed', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(original.id, 'running');
    const current = app.store.get<Run>('run', original.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(original.id, 'completed');
    const sourceBytes = readFileSync(manager.getSessionFile()!);
    const continued = app.service.submit(project.id, 'Continue after the threshold', 'continue', 'pi', policy, [], undefined, { view: 'project' }, original.id);
    const waitRun = async (id: string) => {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        app.scheduler.tick(); const run = app.store.get<Run>('run', id);
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) return run;
        await delay(50);
      }
      throw new Error('worker did not finish');
    };
    const done = await waitRun(continued.run.id);
    assert.equal(done.status, 'completed', done.error ?? 'auto compaction');
    assert.equal(done.sessionAction, undefined);
    assert.equal(done.compaction?.phase, 'completed');
    assert.equal(done.compaction?.reason, 'threshold');
    assert.equal(done.calls, 2);
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(receipt => receipt.runId === done.id);
    assert.deepEqual(receipts.map(receipt => receipt.purpose), ['agent', 'compaction']);
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    const reopened = pi.SessionManager.open(done.sessionPath!, sessions, cwd);
    assert(reopened.getEntries().some(entry => entry.type === 'compaction' && entry.summary.includes('OLD_CONSTRAINT')));
    const output = 'output/dev-evidence/pi-parity/auto-compaction';
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify({ contextWindow: model.contextWindow, reportedInput, calls: done.calls, reason: done.compaction?.reason, purposes: receipts.map(receipt => receipt.purpose), sourceBytes: sourceBytes.length }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

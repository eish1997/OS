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

test('killing the automatic summary request keeps the source, the settled answer and the unreconciled compaction reservation', { timeout: 60000 }, async () => {
  const pi = await loadPi();
  const runtime = await pi.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false });
  const model = runtime.getModel('openai', 'gpt-5.6-sol');
  assert(model);
  const reportedInput = model.contextWindow - 8000;
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-auto-interrupt', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 8, budgetUsd: 80, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-auto-interrupt-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const control = join(root, 'control.txt'); const attempts = join(root, 'attempts.txt');
  writeFileSync(control, 'hang');
  const answer = 'Threshold answer keeps the latest turn.';
  const summary = 'Preserve OLD_CONSTRAINT after the interrupted summary.';
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-auto-interrupt', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        appendFileSync(${JSON.stringify(attempts)}, 'request\\n');
        if (calls > 1 && readFileSync(${JSON.stringify(control)}, 'utf8').trim() === 'hang') await new Promise(() => {});
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
  const app = createApp({ dataDir: join(root, 'data'), password: 'auto-interrupt-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'auto-interrupt-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Threshold interrupt'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('自动压缩中断');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 8, maxCostUsd: 80, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 60000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', autoCompaction: true, autoRetry: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const manager = pi.SessionManager.create(cwd, sessions);
    for (let i = 0; i < 6; i++) manager.appendMessage({ role: 'user', content: `OLD_CONSTRAINT step ${i} ` + 'history '.repeat(8000), timestamp: Date.now() });
    const seeded = app.service.submit(project.id, 'seed', 'seed', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(seeded.id, 'running');
    const current = app.store.get<Run>('run', seeded.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(seeded.id, 'completed');
    const sourceBytes = readFileSync(manager.getSessionFile()!);
    const continued = app.service.submit(project.id, 'Continue after the threshold', 'continue-interrupt', 'pi', policy, [], undefined, { view: 'project' }, seeded.id).run;
    const deadline = Date.now() + 20000;
    let receipts: ModelRequestReceipt[] = [];
    while (Date.now() < deadline) {
      app.scheduler.tick();
      receipts = app.store.list<ModelRequestReceipt>('model_request').filter(receipt => receipt.runId === continued.id);
      const answerSettled = receipts.some(receipt => receipt.purpose === 'agent' && receipt.state === 'settled');
      const summaryReserved = receipts.some(receipt => receipt.purpose === 'compaction' && receipt.state === 'reserved');
      if (answerSettled && summaryReserved) break;
      const run = app.store.get<Run>('run', continued.id);
      if (['failed', 'cancelled', 'interrupted', 'completed'].includes(run.status)) throw new Error(run.error ?? run.status);
      await delay(30);
    }
    const summary = receipts.find(receipt => receipt.purpose === 'compaction');
    assert(summary && summary.state === 'reserved', '自动摘要必须在结算前留下预留');
    assert.equal(app.scheduler.terminateOwnedWorker(continued.id), true);
    const exitDeadline = Date.now() + 8000;
    while (app.store.get<Run>('run', continued.id).status === 'running' && Date.now() < exitDeadline) await delay(30);
    const stopped = app.store.get<Run>('run', continued.id);
    assert.equal(stopped.status, 'interrupted', stopped.error ?? 'auto interrupt');
    assert.equal(stopped.sessionAction, undefined);
    assert(stopped.sessionPath);
    const forkedBytes = readFileSync(stopped.sessionPath);
    assert(forkedBytes.includes(Buffer.from(answer)));
    assert(!forkedBytes.includes(Buffer.from(summary.purpose)));
    assert(!forkedBytes.includes(Buffer.from('Preserve OLD_CONSTRAINT after the interrupted summary')));
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    const frozen = app.store.list<ModelRequestReceipt>('model_request').filter(receipt => receipt.runId === continued.id);
    assert.equal(frozen.find(receipt => receipt.purpose === 'agent')?.state, 'settled');
    assert.equal(frozen.find(receipt => receipt.purpose === 'compaction')?.state, 'reserved');
    assert.equal(frozen.find(receipt => receipt.purpose === 'compaction')?.costUsd, undefined);
    assert.equal(frozen.find(receipt => receipt.purpose === 'compaction')?.usage, undefined);
    assert.equal(stopped.calls, 2);
    assert.equal(stopped.reservedUsd, 10);
    assert.throws(() => app.service.retry(continued.id, 'before-ack'), /对账/);
    writeFileSync(control, 'go');
    app.scheduler.acknowledge(continued.id);
    const resumed = app.service.retry(continued.id, 'after-ack');
    const doneDeadline = Date.now() + 20000;
    let done = resumed;
    while (Date.now() < doneDeadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', resumed.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(30);
    }
    assert.equal(done.status, 'completed', done.error ?? 'auto recovery');
    assert.equal(done.compaction?.reason, 'threshold');
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    assert.deepEqual(readFileSync(stopped.sessionPath), forkedBytes);
    const after = app.store.list<ModelRequestReceipt>('model_request');
    assert.equal(after.find(receipt => receipt.id === summary.id)?.state, 'reserved');
    assert.equal(after.find(receipt => receipt.runId === continued.id && receipt.purpose === 'agent')?.state, 'settled');
    assert(after.some(receipt => receipt.runId === done.id && receipt.purpose === 'compaction' && receipt.state === 'settled'));
    mkdirSync('output/dev-evidence/pi-parity/auto-compaction-interrupt', { recursive: true });
    writeFileSync('output/dev-evidence/pi-parity/auto-compaction-interrupt/report.json', JSON.stringify({ contextWindow: model.contextWindow, reportedInput, sourceBytes: sourceBytes.length, interruptedCalls: stopped.calls, reservedUsd: stopped.reservedUsd, recovered: done.status }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

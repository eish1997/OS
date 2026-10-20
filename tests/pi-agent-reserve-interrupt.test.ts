import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('killing an ordinary agent request after reservation but before any response keeps the receipt reserved', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-agent-reserve-interrupt', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-agent-reserve-interrupt-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const control = join(root, 'control.txt'); const attempts = join(root, 'attempts.txt');
  writeFileSync(control, 'hang');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-agent-reserve-interrupt', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      globalThis.fetch = async () => {
        appendFileSync(${JSON.stringify(attempts)}, 'request\\n');
        if (readFileSync(${JSON.stringify(control)}, 'utf8').trim() === 'hang') await new Promise(() => {});
        const text = 'RECOVERED_AFTER_RESERVE_INTERRUPT';
        const item = { id: 'msg-recovered', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
        const events = [
          { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
          { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.completed', response: { id: 'response-recovered', status: 'completed', output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30, input_tokens_details: { cached_tokens: 0 } } } }
        ];
        return new Response(events.map(event => 'event: ' + event.type + '\\ndata: ' + JSON.stringify(event) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'agent-reserve-interrupt-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'agent-reserve-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Agent reserve transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('回答预留中断');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 256, timeoutMs: 20000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'off', thinkingLevel: 'off', autoCompaction: false, autoRetry: true } };
    const run = app.service.submit(project.id, 'ordinary agent hang after reserve', 'agent-reserve-interrupt', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    const reserveDeadline = Date.now() + 15000;
    let reserved: ModelRequestReceipt | undefined;
    while (Date.now() < reserveDeadline) {
      app.scheduler.tick();
      reserved = app.store.list<ModelRequestReceipt>('model_request').find(receipt => receipt.runId === run.id && receipt.purpose === 'agent');
      if (reserved && existsSync(attempts) && readFileSync(attempts, 'utf8').includes('request')) break;
      const currentRun = app.store.get<Run>('run', run.id);
      if (['failed', 'cancelled', 'interrupted', 'completed'].includes(currentRun.status)) throw new Error(currentRun.error ?? currentRun.status);
      await delay(30);
    }
    assert(reserved, '回答请求必须先留下预留再中断');
    assert.equal(reserved.state, 'reserved');
    assert.equal(app.scheduler.terminateOwnedWorker(run.id), true);
    const exitDeadline = Date.now() + 8000;
    while (app.store.get<Run>('run', run.id).status === 'running' && Date.now() < exitDeadline) await delay(30);
    const stopped = app.store.get<Run>('run', run.id);
    assert.equal(stopped.status, 'interrupted', stopped.error ?? 'agent reserve interrupt');
    const receipt = app.store.list<ModelRequestReceipt>('model_request').find(item => item.id === reserved.id)!;
    assert.equal(receipt.purpose, 'agent');
    assert.equal(receipt.state, 'reserved');
    assert.equal(receipt.costUsd, undefined);
    assert.equal(receipt.usage, undefined);
    assert.equal(stopped.calls, 1);
    assert.equal(stopped.reservedUsd, 10);
    assert.equal(stopped.spentUsd, 0);
    assert.throws(() => app.service.retry(run.id, 'before-ack'), /对账/);
    writeFileSync(control, 'go');
    app.scheduler.acknowledge(run.id);
    const resumed = app.service.retry(run.id, 'after-ack');
    const doneDeadline = Date.now() + 15000;
    let done = resumed;
    while (Date.now() < doneDeadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', resumed.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(30);
    }
    assert.equal(done.status, 'completed', done.error ?? 'agent recovery');
    const receipts = app.store.list<ModelRequestReceipt>('model_request');
    assert.equal(receipts.find(item => item.id === reserved.id)?.state, 'reserved');
    assert.equal(receipts.find(item => item.runId === done.id)?.state, 'settled');
    assert.equal(receipts.find(item => item.runId === done.id)?.purpose, 'agent');
    mkdirSync('output/dev-evidence/pi-parity/loop-109', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-109', 'report.json'), JSON.stringify({
      purpose: 'agent',
      interruptedState: receipt.state,
      reservedUsd: stopped.reservedUsd,
      recovered: done.status,
      window: 'after-reserve-before-response-bytes'
    }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

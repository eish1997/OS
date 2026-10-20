import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { toolExecutions } from '../server/tool-progress.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('killing a mid-stream function_call before tool start leaves no tool execution and keeps the reservation', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-partial-toolcall', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-partial-toolcall-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const attempts = join(root, 'attempts.txt'); const effects = join(root, 'effects.txt');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-partial-toolcall', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      pi.registerTool({ name: 'should_not_run', label: 'Must not run', description: 'Half-cut tool call must not execute', parameters: { type: 'object', properties: {} }, execute: async () => {
        appendFileSync(${JSON.stringify(effects)}, 'EXECUTED\\n');
        return { content: [{ type: 'text', text: 'SHOULD_NOT_RUN' }], details: {} };
      }});
      globalThis.fetch = async () => {
        appendFileSync(${JSON.stringify(attempts)}, 'request\\n');
        // Emit only a partial function_call arguments delta, then hang without output_item.done.
        const events = [
          { type: 'response.output_item.added', output_index: 0, item: { id: 'fc-partial', call_id: 'call-partial', type: 'function_call', name: 'should_not_run', arguments: '', status: 'in_progress' } },
          { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc-partial', delta: '{"half":' }
        ];
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(events.map(e => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join('')));
            // Keep the stream open without a terminal event so the tool never starts.
          }
        }), { headers: { 'Content-Type': 'text/event-stream' } });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'partial-toolcall-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'partial-toolcall-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Partial toolcall'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('半截函数调用');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 256, timeoutMs: 20000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'off', thinkingLevel: 'off', autoCompaction: false, autoRetry: true, networkIdleTimeoutMs: 15000 } };
    const run = app.service.submit(project.id, 'Emit a half-cut tool call', 'partial-toolcall', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    const reserveDeadline = Date.now() + 25000;
    let reserved: ModelRequestReceipt | undefined;
    while (Date.now() < reserveDeadline) {
      app.scheduler.tick();
      const current = app.store.get<Run>('run', run.id);
      if (['failed', 'cancelled', 'interrupted', 'completed'].includes(current.status) && !app.scheduler.pluginMaintenanceBlocked()) {
        throw new Error(current.error ?? current.status);
      }
      if (existsSync(attempts) && readFileSync(attempts, 'utf8').includes('request')) {
        reserved = app.store.list<ModelRequestReceipt>('model_request').find(receipt => receipt.runId === run.id);
        if (reserved) break;
      }
      await delay(30);
    }
    assert(reserved, '半截函数调用前必须已预留');
    assert.equal(reserved.purpose, 'agent');
    // Give the partial deltas a moment to land without ever starting the tool.
    await delay(200);
    assert.equal(toolExecutions(app.store, run.id).items.length, 0, '工具尚未开始');
    assert.equal(existsSync(effects), false);
    assert.equal(app.scheduler.terminateOwnedWorker(run.id), true);
    const exitDeadline = Date.now() + 8000;
    while (app.store.get<Run>('run', run.id).status === 'running' && Date.now() < exitDeadline) await delay(30);
    const stopped = app.store.get<Run>('run', run.id);
    assert.equal(stopped.status, 'interrupted', stopped.error ?? 'partial toolcall interrupt');
    assert.equal(toolExecutions(app.store, run.id).items.length, 0);
    assert.equal(existsSync(effects), false);
    const receipt = app.store.list<ModelRequestReceipt>('model_request').find(item => item.id === reserved.id)!;
    assert.equal(receipt.state, 'reserved');
    assert.equal(receipt.purpose, 'agent');
    assert.equal(receipt.costUsd, undefined);
    assert.equal(stopped.calls, 1);
    assert.equal(stopped.reservedUsd, 10);
    assert.throws(() => app.service.retry(run.id, 'before-ack'), /对账/);
    const ackDeadline = Date.now() + 20000;
    let acked = false;
    while (!acked && Date.now() < ackDeadline) {
      try { app.scheduler.acknowledge(run.id); acked = true; } catch { await delay(50); }
    }
    assert(acked, 'force-stop tree confirmation must finish before acknowledge');
    const resumed = app.service.retry(run.id, 'after-ack');
    assert.equal(resumed.status, 'queued');
    assert.equal(app.store.list<ModelRequestReceipt>('model_request').find(item => item.id === reserved.id)?.state, 'reserved');
    mkdirSync('output/dev-evidence/pi-parity/loop-110', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-110', 'report.json'), JSON.stringify({
      toolExecutions: 0,
      effects: false,
      receiptState: receipt.state,
      reservedUsd: stopped.reservedUsd,
      window: 'mid-function-call-before-tool-start'
    }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

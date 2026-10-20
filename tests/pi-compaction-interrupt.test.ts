import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('killing a production compaction during the summary request keeps the source and the unreconciled reservation', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-compaction-interrupt', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-compaction-interrupt-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const control = join(root, 'control.txt'); const attempts = join(root, 'attempts.txt');
  writeFileSync(control, 'hang');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-compaction-interrupt', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync, readFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      globalThis.fetch = async () => {
        appendFileSync(${JSON.stringify(attempts)}, 'request\\n');
        if (readFileSync(${JSON.stringify(control)}, 'utf8').trim() === 'hang') await new Promise(() => {});
        const text = 'Recovered summary keeps FIXED_TOKEN.';
        const item = { id: 'msg-recovered', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
        const events = [
          { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
          { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.completed', response: { id: 'response-recovered', status: 'completed', output: [item], usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220, input_tokens_details: { cached_tokens: 0 } } } }
        ];
        return new Response(events.map(event => 'event: ' + event.type + '\\ndata: ' + JSON.stringify(event) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'compaction-interrupt-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'interrupt-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Interrupt transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('压缩中断');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 20000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', autoCompaction: true, autoRetry: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const pi = await loadPi(); const manager = pi.SessionManager.create(cwd, sessions);
    for (let i = 0; i < 6; i++) manager.appendMessage({ role: 'user', content: `FIXED_TOKEN step ${i} ` + 'history '.repeat(8000), timestamp: Date.now() });
    const seeded = app.service.submit(project.id, 'seed', 'seed', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(seeded.id, 'running');
    const current = app.store.get<Run>('run', seeded.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(seeded.id, 'completed');
    const sourceBytes = readFileSync(manager.getSessionFile()!);
    const compact = app.service.submit(project.id, 'manual compaction', 'compact-interrupt', 'pi', policy, [], undefined, { view: 'project' }, seeded.id, undefined, 'compact').run;
    const reserveDeadline = Date.now() + 15000;
    let reserved: ModelRequestReceipt | undefined;
    while (Date.now() < reserveDeadline) {
      app.scheduler.tick();
      reserved = app.store.list<ModelRequestReceipt>('model_request').find(receipt => receipt.runId === compact.id && receipt.purpose === 'compaction');
      if (reserved && existsSync(attempts) && readFileSync(attempts, 'utf8').includes('request')) break;
      const currentRun = app.store.get<Run>('run', compact.id);
      if (['failed', 'cancelled', 'interrupted', 'completed'].includes(currentRun.status)) throw new Error(currentRun.error ?? currentRun.status);
      await delay(30);
    }
    assert(reserved, '摘要请求必须先留下预留再中断');
    assert.equal(app.scheduler.terminateOwnedWorker(compact.id), true);
    const exitDeadline = Date.now() + 8000;
    while (app.store.get<Run>('run', compact.id).status === 'running' && Date.now() < exitDeadline) await delay(30);
    const stopped = app.store.get<Run>('run', compact.id);
    assert.equal(stopped.status, 'interrupted', stopped.error ?? 'compaction interrupt');
    assert(stopped.sessionPath);
    assert.notEqual(stopped.sessionPath, manager.getSessionFile());
    const forkedBytes = readFileSync(stopped.sessionPath);
    assert(!forkedBytes.includes(Buffer.from('Recovered summary')));
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    const receipt = app.store.list<ModelRequestReceipt>('model_request').find(item => item.id === reserved.id)!;
    assert.equal(receipt.state, 'reserved');
    assert.equal(receipt.purpose, 'compaction');
    assert.equal(receipt.costUsd, undefined);
    assert.equal(receipt.usage, undefined);
    assert.equal(stopped.calls, 1);
    assert.equal(stopped.reservedUsd, 10);
    assert.equal(stopped.spentUsd, 0);
    assert.notEqual(stopped.usage?.complete, true);
    assert.throws(() => app.service.retry(compact.id, 'before-ack'), /对账/);
    writeFileSync(control, 'go');
    const ackDeadline = Date.now() + 20000;
    let acked = false;
    while (!acked && Date.now() < ackDeadline) {
      try { app.scheduler.acknowledge(compact.id); acked = true; } catch { await delay(50); }
    }
    assert(acked, 'force-stop tree confirmation must finish before acknowledge');
    const resumed = app.service.retry(compact.id, 'after-ack');
    // Resume runs a full compaction worker; 15s is tight after prior suite load.
    const doneDeadline = Date.now() + 30000;
    let done = resumed;
    while (Date.now() < doneDeadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', resumed.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(30);
    }
    assert.equal(done.status, 'completed', done.error ?? 'compaction recovery');
    assert.equal(done.compaction?.reason, 'manual');
    assert.deepEqual(readFileSync(manager.getSessionFile()!), sourceBytes);
    assert.deepEqual(readFileSync(stopped.sessionPath!), forkedBytes);
    assert(readFileSync(done.sessionPath!, 'utf8').includes('FIXED_TOKEN'));
    const receipts = app.store.list<ModelRequestReceipt>('model_request');
    assert.equal(receipts.find(item => item.id === reserved.id)?.state, 'reserved');
    assert.equal(receipts.find(item => item.runId === done.id)?.state, 'settled');
    assert.equal(receipts.find(item => item.runId === done.id)?.purpose, 'compaction');
    const output = 'output/dev-evidence/pi-parity/compaction-interrupt';
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify({ sourceBytes: sourceBytes.length, interruptedCalls: stopped.calls, reservedUsd: stopped.reservedUsd, receiptState: 'reserved', recovered: done.status }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

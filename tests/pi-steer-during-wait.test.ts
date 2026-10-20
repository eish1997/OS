import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { PluginInteraction } from '../shared/plugin-interaction.js';
import type { RunInput } from '../shared/run-input.js';

test('steering sent while a dialog is pending stays on that run and reaches the next model request', { timeout: 40000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-steer-wait', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-steer-wait-'));
  const source = join(root, 'plugin');
  mkdirSync(source);
  const payloads = join(root, 'payloads.jsonl');
  const usage = { input_tokens: 12, output_tokens: 4, total_tokens: 16, input_tokens_details: { cached_tokens: 0 } };
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'owned-steer-wait', pi: { extensions: ['index.mjs'] } }));
  writeFileSync(join(source, 'index.mjs'), `import { appendFileSync } from 'node:fs';
    const usage = ${JSON.stringify(usage)};
    const payloads = ${JSON.stringify(payloads)};
    export default pi => {
      pi.on('session_start', () => {
        const original = globalThis.fetch; let calls = 0;
        globalThis.fetch = async (url, init) => {
          if (!String(url).startsWith('https://api.openai.com/')) return original(url, init);
          appendFileSync(payloads, String(init?.body ?? '') + '\\n');
          calls++;
          if (calls === 1) {
            const item = { id: 'hold', call_id: 'hold', type: 'function_call', name: 'hold', arguments: '{}', status: 'completed' };
            const events = [
              { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
              { type: 'response.function_call_arguments.delta', output_index: 0, item_id: item.id, delta: '{}' },
              { type: 'response.output_item.done', output_index: 0, item },
              { type: 'response.completed', response: { id: 'r1', status: 'completed', output: [item], usage } }
            ];
            return new Response(events.map(e => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
          }
          const item = { id: 'msg', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'STEER_WAIT_DONE', annotations: [] }] };
          const events = [
            { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
            { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
            { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'STEER_WAIT_DONE' },
            { type: 'response.output_item.done', output_index: 0, item },
            { type: 'response.completed', response: { id: 'r2', status: 'completed', output: [item], usage } }
          ];
          return new Response(events.map(e => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
        };
        pi.registerTool({ name: 'hold', label: 'hold', description: 'Wait for the user', parameters: { type: 'object', properties: {} }, execute: async (id, args, signal, onUpdate, ctx) => {
          const ok = await ctx.ui.confirm('Hold', 'Continue?', { signal });
          return { content: [{ type: 'text', text: ok ? 'HELD_YES' : 'HELD_NO' }], details: {} };
        }});
      });
    };`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'steer-wait-password', schedule: false });
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'steer-wait', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir);
    state.phase(op.id, 'committing', 'Steer'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('等待中指导');
    const conversation = app.service.createConversation(project.id, '话题', 'steer-wait-conv');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'Hold then continue', 'steer-wait-run', 'pi', policy, [], undefined, { view: 'project' }, null, conversation.id).run;
    let steered = false;
    let final = run;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      const pending = app.store.list<PluginInteraction>('plugin_interaction').find(item => item.runId === run.id && item.state === 'pending');
      if (!steered && pending && app.store.get<Run>('run', run.id).status === 'waiting_interaction') {
        const input = app.scheduler.steer(run.id, conversation.id, 'during-wait', 'STEER_WHILE_WAITING');
        assert.equal(input.runId, run.id);
        steered = true;
        app.scheduler.answerDialog(run.id, pending.id, pending.revision, pending.id, true);
      }
      final = app.store.get<Run>('run', run.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(final.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    assert.equal(steered, true);
    assert.equal(final.status, 'completed', final.error ?? 'steer during wait');
    const input = app.store.list<RunInput>('run_input').find(item => item.commandId === 'during-wait')!;
    assert.equal(input.runId, run.id);
    assert.equal(input.state, 'applied');
    const bodies = readFileSync(payloads, 'utf8');
    assert(bodies.includes('STEER_WHILE_WAITING'));
    assert.equal(app.store.list<Run>('run').filter(item => item.conversationId === conversation.id).length, 1);
    mkdirSync('output/dev-evidence/pi-parity/loop-121', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-121', 'report.json'), JSON.stringify({
      status: final.status,
      input: { runId: input.runId, state: input.state },
      sameRun: input.runId === run.id
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

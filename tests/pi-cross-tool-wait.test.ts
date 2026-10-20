import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { PluginInteraction } from '../shared/plugin-interaction.js';
import type { ToolExecution } from '../shared/run-stream.js';

test('two independent tools wait in parallel and apply answers without crossing side effects', { timeout: 40000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-cross-tool', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 100, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-cross-tool-'));
  const source = join(root, 'plugin');
  mkdirSync(source);
  const effects = join(root, 'effects.txt');
  const usage = { input_tokens: 20, output_tokens: 8, total_tokens: 28, input_tokens_details: { cached_tokens: 0 } };
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'owned-cross-tool', pi: { extensions: ['index.mjs'] } }));
  writeFileSync(join(source, 'index.mjs'), `import { appendFileSync } from 'node:fs';
    const effects = ${JSON.stringify(effects)};
    const usage = ${JSON.stringify(usage)};
    function tool(name, mark) {
      return { id: name, call_id: name, type: 'function_call', name, arguments: '{}', status: 'completed', mark };
    }
    export default pi => {
      pi.on('session_start', () => {
        const original = globalThis.fetch; let calls = 0;
        globalThis.fetch = async (url, init) => {
          if (!String(url).startsWith('https://api.openai.com/')) return original(url, init);
          calls++;
          if (calls === 1) {
            const items = [tool('gate_a','A'), tool('gate_b','B')].map(({mark,...item}) => item);
            const events = [];
            items.forEach((item, index) => {
              events.push({ type: 'response.output_item.added', output_index: index, item: { ...item, arguments: '' } });
              events.push({ type: 'response.function_call_arguments.delta', output_index: index, item_id: item.id, delta: '{}' });
              events.push({ type: 'response.output_item.done', output_index: index, item });
            });
            events.push({ type: 'response.completed', response: { id: 'r1', status: 'completed', output: items, usage } });
            return new Response(events.map(e => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
          }
          const item = { id: 'msg', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'CROSS_DONE', annotations: [] }] };
          const events = [
            { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
            { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
            { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'CROSS_DONE' },
            { type: 'response.output_item.done', output_index: 0, item },
            { type: 'response.completed', response: { id: 'r2', status: 'completed', output: [item], usage } }
          ];
          return new Response(events.map(e => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
        };
        for (const [name, mark] of [['gate_a','A'],['gate_b','B']]) {
          pi.registerTool({ name, label: name, description: 'Independent gate', parameters: { type: 'object', properties: {} }, execute: async (id, args, signal, onUpdate, ctx) => {
            const ok = await ctx.ui.confirm('Gate ' + mark, 'Allow ' + mark + '?', { signal });
            if (ok) appendFileSync(effects, mark + '\\n');
            return { content: [{ type: 'text', text: ok ? mark + '_YES' : mark + '_NO' }], details: {} };
          }});
        }
      });
    };`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'cross-tool-password', schedule: false });
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'cross-tool', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir);
    state.phase(op.id, 'committing', 'Cross'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('跨工具等待');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 100, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'Run both gates', 'cross', 'pi', policy, [], undefined, { view: 'project' }).run;
    let sawBoth = false;
    let final = run;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      const pending = app.store.list<PluginInteraction>('plugin_interaction').filter(item => item.runId === run.id && item.state === 'pending');
      if (pending.length >= 2 && pending.some(item => item.title === 'Gate A') && pending.some(item => item.title === 'Gate B')) {
        sawBoth = true;
        assert.equal(app.store.get<Run>('run', run.id).status, 'waiting_interaction');
        const ordered = [...pending].sort((a, b) => b.title.localeCompare(a.title));
        for (const item of ordered) {
          const allow = item.title === 'Gate B';
          app.scheduler.answerDialog(run.id, item.id, item.revision, item.id, allow);
        }
      }
      final = app.store.get<Run>('run', run.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(final.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    assert.equal(sawBoth, true, 'both independent tools must be pending together');
    assert.equal(final.status, 'completed', final.error ?? 'cross tool');
    const lines = existsSync(effects) ? readFileSync(effects, 'utf8').trim().split('\n') : [];
    assert.deepEqual(lines, ['B']);
    const tools = app.store.list<ToolExecution>('tool_execution').filter(item => item.runId === run.id);
    const gateA = tools.find(item => item.name === 'gate_a');
    const gateB = tools.find(item => item.name === 'gate_b');
    assert.equal(gateA?.phase, 'completed');
    assert.equal(gateB?.phase, 'completed');
    assert.notEqual(gateA?.id, gateB?.id);
    const text = readFileSync(final.sessionPath!, 'utf8');
    assert(text.includes('A_NO'));
    assert(text.includes('B_YES'));
    mkdirSync('output/dev-evidence/pi-parity/loop-117', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-117', 'report.json'), JSON.stringify({
      status: final.status,
      simultaneous: sawBoth,
      effects: lines,
      tools: tools.map(item => ({ name: item.name, id: item.id, phase: item.phase }))
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

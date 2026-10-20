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
import type { ToolExecution } from '../shared/run-stream.js';

test('parallel MCP tool failures both stay outcome-unknown until each is reconciled', { timeout: 40000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-parallel-unknown', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-parallel-unknown-'));
  const source = join(root, 'plugin');
  mkdirSync(source);
  const server = join(root, 'mcp.mjs');
  const calls = join(root, 'mcp.calls');
  const usage = { input_tokens: 20, output_tokens: 8, total_tokens: 28, input_tokens_details: { cached_tokens: 0 } };
  writeFileSync(server, `import { createInterface } from 'node:readline';
    import { appendFileSync } from 'node:fs';
    const lines = createInterface({ input: process.stdin });
    lines.on('close', () => process.exit(0));
    lines.on('line', line => {
      const q = JSON.parse(line); if (q.id === undefined) return; let result;
      if (q.method === 'initialize') result = { protocolVersion: q.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned', version: '1' } };
      else if (q.method === 'tools/list') result = { tools: ['a','b'].map(name => ({ name, description: 'Owned', inputSchema: { type: 'object', properties: {} } })) };
      else if (q.method === 'tools/call') { appendFileSync(${JSON.stringify(calls)}, q.params.name + '\\n'); process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, error: { code: -32000, message: 'partial' } }) + '\\n'); return; }
      else result = {};
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }) + '\\n');
    });`);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'owned-parallel-unknown', pi: { extensions: ['index.mjs'] } }));
  writeFileSync(join(source, 'index.mjs'), `const usage = ${JSON.stringify(usage)};
    export default pi => pi.on('session_start', () => {
      const original = globalThis.fetch; let calls = 0;
      globalThis.fetch = async (url, init) => {
        if (!String(url).startsWith('https://api.openai.com/')) return original(url, init);
        calls++;
        const items = ['mcp__fixture__a','mcp__fixture__b'].map(name => ({ id: name, call_id: name, type: 'function_call', name, arguments: '{}', status: 'completed' }));
        const events = [];
        items.forEach((item, index) => {
          events.push({ type: 'response.output_item.added', output_index: index, item: { ...item, arguments: '' } });
          events.push({ type: 'response.function_call_arguments.delta', output_index: index, item_id: item.id, delta: '{}' });
          events.push({ type: 'response.output_item.done', output_index: index, item });
        });
        events.push({ type: 'response.completed', response: { id: 'r' + calls, status: 'completed', output: items, usage } });
        return new Response(events.map(e => 'event: ' + e.type + '\\ndata: ' + JSON.stringify(e) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'parallel-unknown-password', schedule: false });
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'parallel-unknown', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir);
    state.phase(op.id, 'committing', 'Unknown'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    await app.mcp.update({ revision: 0, json: JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [server], exposure: 'direct', timeout: 3 } } }), source: 'parallel unknown', active: true, trusted: true, codemode: false, toolSearch: false });
    const project = app.service.createProject('并行未知结果');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'Call both MCP tools', 'parallel-unknown', 'pi', policy, [], undefined, { view: 'project' }).run;
    let final = run;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      final = app.store.get<Run>('run', run.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(final.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    assert.notEqual(final.status, 'completed', final.error ?? 'unknown outcomes must not complete the run');
    assert(['failed', 'interrupted'].includes(final.status), final.error ?? final.status);
    assert(existsSync(calls));
    const called = readFileSync(calls, 'utf8').trim().split('\n').sort();
    assert.deepEqual(called, ['a', 'b']);
    const tools = app.store.list<ToolExecution>('tool_execution').filter(item => item.runId === run.id);
    const a = tools.find(item => item.name === 'mcp__fixture__a');
    const b = tools.find(item => item.name === 'mcp__fixture__b');
    assert(a && b, `both receipts required; have ${tools.map(item => item.name).join(',')}`);
    assert.equal(a.phase, 'failed');
    assert.equal(b.phase, 'failed');
    assert.equal(a.outcomeUnknown, true);
    assert.equal(b.outcomeUnknown, true);
    assert.notEqual(a.id, b.id);
    assert.throws(() => app.service.retry(run.id, 'before'), /尚未确认|对账/);
    mkdirSync('output/dev-evidence/pi-parity/loop-119', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-119', 'report.json'), JSON.stringify({
      status: final.status,
      called,
      tools: [a, b].map(item => ({ name: item.name, id: item.id, phase: item.phase, outcomeUnknown: item.outcomeUnknown }))
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

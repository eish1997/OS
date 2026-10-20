import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { steeringTransport } from './helpers/steering-transport.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ToolExecution } from '../shared/run-stream.js';

test('codemode nested MCP calls leave independent durable tool executions for parent and nested tools', { timeout: 40000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-nested-receipts', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 5, budgetUsd: 100, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-nested-receipts-'));
  const transport = steeringTransport(root);
  const file = join(transport.source, 'transport.mjs');
  const args = JSON.stringify({ code: 'const result = await tools.mcp__fixture__echo({}); text(result);' });
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace("name:'wait_control',arguments:'{}'", `name:'codemode',arguments:${JSON.stringify(args)}`)
    .replace("delta:'{}'", `delta:${JSON.stringify(args)}`));
  const server = join(root, 'mcp.mjs'); const calls = join(root, 'mcp.calls');
  writeFileSync(server, `import { createInterface } from 'node:readline'; import { appendFileSync } from 'node:fs';
    const lines = createInterface({ input: process.stdin });
    lines.on('close', () => process.exit(0));
    lines.on('line', line => {
      const q = JSON.parse(line); if (q.id === undefined) return; let result;
      if (q.method === 'initialize') result = { protocolVersion: q.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned', version: '1' } };
      else if (q.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'Owned test', inputSchema: { type: 'object', properties: {} } }] };
      else if (q.method === 'tools/call') { appendFileSync(${JSON.stringify(calls)}, 'CALLED\\n'); result = { content: [{ type: 'text', text: 'NESTED_MCP_OK' }] }; }
      else result = {};
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }) + '\\n');
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'nested-receipts-password', schedule: false });
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source: transport.source, revision: state.configuration().revision, commandId: 'nested-transport', trusted: true });
    const pkg = await inspectPlugin(transport.source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Nested'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    await app.mcp.update({ revision: 0, json: JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [server], exposure: 'codemode', timeout: 3 } } }), source: 'owned nested test', active: true, trusted: true, codemode: true, toolSearch: false });
    const project = app.service.createProject('嵌套工具回执');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 5, maxCostUsd: 100, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 45000 };
    const run = app.service.submit(project.id, 'Call nested MCP through codemode', 'nested-receipts', 'pi', policy, [], undefined, { view: 'project' }).run;
    const deadline = Date.now() + 50000;
    let final = run;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      final = app.store.get<Run>('run', run.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(final.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    assert.equal(final.status, 'completed', final.error ?? 'nested receipts');
    assert(existsSync(calls));
    assert.equal(readFileSync(calls, 'utf8').trim(), 'CALLED');
    const tools = app.store.list<ToolExecution>('tool_execution').filter(item => item.runId === run.id);
    const parent = tools.find(item => item.name === 'codemode');
    const nested = tools.find(item => item.name === 'mcp__fixture__echo');
    assert(parent, `codemode 父工具必须有独立回执；现有 ${tools.map(item => item.name).join(',') || '无'}`);
    assert(nested, `嵌套 MCP 必须有独立回执；现有 ${tools.map(item => item.name).join(',') || '无'}`);
    assert.notEqual(parent.id, nested.id);
    if (parent.callId && nested.callId) assert.notEqual(parent.callId, nested.callId);
    assert.equal(parent.phase, 'completed');
    assert.equal(nested.phase, 'completed');
    assert.equal(parent.source, 'builtin:codemode');
    assert.equal(nested.source, 'builtin:mcp');
    assert(readFileSync(final.sessionPath!, 'utf8').includes('NESTED_MCP_OK'));
    mkdirSync('output/dev-evidence/pi-parity/loop-113', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-113', 'report.json'), JSON.stringify({
      parent: { name: parent.name, id: parent.id, callId: parent.callId, phase: parent.phase, source: parent.source },
      nested: { name: nested.name, id: nested.id, callId: nested.callId, phase: nested.phase, source: nested.source },
      independent: parent.id !== nested.id,
      toolNames: tools.map(item => item.name)
    }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

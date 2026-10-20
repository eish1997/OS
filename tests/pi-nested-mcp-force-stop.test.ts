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

test('codemode nested MCP force-stop kills MCP grandchildren and keeps independent unsettled receipts', {
  timeout: 40000,
  skip: process.platform !== 'win32'
}, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-nested-stop', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 5, budgetUsd: 100, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-nested-stop-'));
  const transport = steeringTransport(root);
  const file = join(transport.source, 'transport.mjs');
  const args = JSON.stringify({ code: 'const result = await tools.mcp__fixture__echo({}); text(result);' });
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace("name:'wait_control',arguments:'{}'", `name:'codemode',arguments:${JSON.stringify(args)}`)
    .replace("delta:'{}'", `delta:${JSON.stringify(args)}`));
  const server = join(root, 'mcp.mjs');
  const pidFile = join(root, 'mcp.pid');
  const descendantPid = join(root, 'descendant.pid');
  const calls = join(root, 'mcp.calls');
  writeFileSync(server, `import { createInterface } from 'node:readline';
    import { writeFileSync, appendFileSync } from 'node:fs';
    import { spawn } from 'node:child_process';
    writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    const descendant = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
    writeFileSync(${JSON.stringify(descendantPid)}, String(descendant.pid));
    const lines = createInterface({ input: process.stdin });
    setInterval(() => {}, 1000);
    lines.on('line', line => {
      const q = JSON.parse(line); if (q.id === undefined) return; let result;
      if (q.method === 'initialize') result = { protocolVersion: q.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned', version: '1' } };
      else if (q.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'Owned test', inputSchema: { type: 'object', properties: {} } }] };
      else if (q.method === 'tools/call') { appendFileSync(${JSON.stringify(calls)}, 'CALLED\\n'); return; }
      else result = {};
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }) + '\\n');
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'nested-stop-password', schedule: false });
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source: transport.source, revision: state.configuration().revision, commandId: 'nested-stop-transport', trusted: true });
    const pkg = await inspectPlugin(transport.source, app.plugins.agentDir);
    state.phase(op.id, 'committing', 'Nested stop'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    await app.mcp.update({ revision: 0, json: JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [server], exposure: 'codemode', timeout: 3 } } }), source: 'owned nested stop', active: true, trusted: true, codemode: true, toolSearch: false });
    const project = app.service.createProject('嵌套MCP强停');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 5, maxCostUsd: 100, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 45000 };
    const run = app.service.submit(project.id, 'Nested MCP then force stop', 'nested-stop', 'pi', policy, [], undefined, { view: 'project' }).run;
    const deadline = Date.now() + 35000;
    let final = run;
    let stopped = false;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      if (!stopped && existsSync(calls) && existsSync(descendantPid)) {
        assert(app.scheduler.terminateOwnedWorker(run.id));
        stopped = true;
      }
      final = app.store.get<Run>('run', run.id);
      if (final.status === 'interrupted' || (['completed', 'failed', 'cancelled'].includes(final.status) && !app.scheduler.pluginMaintenanceBlocked())) break;
      await delay(20);
    }
    assert.equal(stopped, true, 'must reach nested MCP call before force-stop');
    assert.equal(final.status, 'interrupted', final.error ?? 'nested force-stop');
    const tools = app.store.list<ToolExecution>('tool_execution').filter(item => item.runId === run.id);
    const parent = tools.find(item => item.name === 'codemode');
    const nested = tools.find(item => item.name === 'mcp__fixture__echo');
    assert(parent, `codemode parent receipt required; have ${tools.map(item => item.name).join(',') || 'none'}`);
    assert(nested, `nested MCP receipt required; have ${tools.map(item => item.name).join(',') || 'none'}`);
    assert.notEqual(parent.id, nested.id);
    assert.equal(parent.phase, 'running');
    assert.equal(nested.phase, 'running');
    assert.throws(() => app.service.retry(run.id, 'unsafe-replay'), /尚未确认|对账/);
    const mcpPid = Number(readFileSync(pidFile, 'utf8'));
    const childPid = Number(readFileSync(descendantPid, 'utf8'));
    const cleanup = Date.now() + 4000;
    let mcpAlive = true;
    let childAlive = true;
    while ((mcpAlive || childAlive) && Date.now() < cleanup) {
      if (mcpAlive) try { process.kill(mcpPid, 0); } catch { mcpAlive = false; }
      if (childAlive) try { process.kill(childPid, 0); } catch { childAlive = false; }
      if (mcpAlive || childAlive) await delay(20);
    }
    assert.equal(mcpAlive, false, 'MCP server process must exit');
    assert.equal(childAlive, false, 'MCP grandchild must be killed with the owned tree');
    mkdirSync('output/dev-evidence/pi-parity/loop-115', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-115', 'report.json'), JSON.stringify({
      status: final.status,
      parent: { name: parent.name, id: parent.id, phase: parent.phase, source: parent.source },
      nested: { name: nested.name, id: nested.id, phase: nested.phase, source: nested.source },
      mcpPidGone: !mcpAlive,
      grandchildPidGone: !childAlive,
      retryBlockedUntilReconcile: true
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

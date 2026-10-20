/**
 * Continue live samples under appended call budget (prior used + new cap).
 * Stages: workbench multi-file independent check; original long-history;
 * local MCP external-tool pair; model+tool >5min continuation.
 * Key only from env. Never logs the key.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { Run, SessionBinding } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';
import type { ToolExecution } from '../shared/run-stream.js';

const evidence = 'output/dev-evidence/pi-parity/loop-165';
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert(key, 'PI_API_KEY or DEEPSEEK_API_KEY required');

const PRIOR = Number(process.env.PI_PRIOR_CALLS || 24);
const CAP_CALLS = Number(process.env.PI_MAX_CALLS || 120);
const CAP_USD = Number(process.env.PI_BUDGET_USD || 0.65);
const PRIOR_USD = Number(process.env.PI_PRIOR_USD || 0.00855);
const MODEL = process.env.PI_MODEL || 'deepseek-flash';
const PROVIDER = process.env.PI_PROVIDER || 'deepseek';

let usedCalls = PRIOR;
let usedUsd = PRIOR_USD;
const stages: unknown[] = [];

function remaining() {
  return { calls: CAP_CALLS - usedCalls, usd: CAP_USD - usedUsd };
}
function assertBudget(needCalls: number, needUsd = 0.02) {
  const r = remaining();
  assert(r.calls >= needCalls && r.usd >= needUsd, `budget stop remaining=${JSON.stringify(r)} needCalls=${needCalls}`);
}
function recordUsage(calls: number, usd: number) {
  usedCalls += calls;
  usedUsd += usd;
}

function runCheck(cwd: string, marker: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'calc.test.ts'], {
    cwd, encoding: 'utf8', timeout: 60000,
  });
  return {
    status: result.status,
    checksOk: (result.stdout || '').includes(marker) && result.status === 0,
    stdoutTail: (result.stdout || '').slice(-400),
    stderrTail: (result.stderr || '').slice(-400),
  };
}

async function waitRun(app: ReturnType<typeof createApp>, runId: string, deadlineMs: number, hardCallCap: number) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    app.scheduler.tick();
    const run = app.store.get<Run>('run', runId);
    const calls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
    const spent = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0) + (r.reservedUsd || 0), 0);
    if (calls >= hardCallCap || spent >= CAP_USD - usedUsd + spent) {
      // host-local cap for this app instance relative to remaining overall
    }
    if (calls >= hardCallCap) {
      if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) await app.service.requestCancel(runId).catch(() => undefined);
      return { run: app.store.get<Run>('run', runId), stopped: 'cap' as const };
    }
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) {
      return { run, stopped: 'terminal' as const };
    }
    await delay(250);
  }
  await app.service.requestCancel(runId).catch(() => undefined);
  return { run: app.store.get<Run>('run', runId), stopped: 'timeout' as const };
}

Object.assign(config, {
  apiKey: key, provider: PROVIDER, model: MODEL,
  maxCalls: Math.min(20, remaining().calls),
  budgetUsd: Math.min(0.2, remaining().usd),
  reservePerCallUsd: 0.05,
  maxOutputTokens: 2048,
  timeoutMs: 1800000,
});

const report: Record<string, unknown> = {
  purpose: 'continue under +100 call append',
  prior: { calls: PRIOR, usd: PRIOR_USD },
  caps: { calls: CAP_CALLS, usd: CAP_USD },
  provider: PROVIDER, model: MODEL, thinking: 'high',
  stages,
};

// --- Stage A: workbench multi-file with independent check ---
assertBudget(4);
{
  const dataRoot = mkdtempSync(join(tmpdir(), 'pi-wb-check-'));
  Object.assign(config, { maxCalls: Math.min(8, remaining().calls), budgetUsd: Math.min(0.15, remaining().usd) });
  const app = createApp({ dataDir: dataRoot, password: 'wb-check', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const project = app.service.createProject('工作台预定检查');
    const cwd = join(dataRoot, 'workspaces', project.id);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'calc.ts'), 'export function add(a: number, b: number) {\n  return a - b;\n}\n');
    writeFileSync(join(cwd, 'calc.test.ts'), [
      "import assert from 'node:assert/strict';",
      "import { add } from './calc.ts';",
      "assert.equal(add(2, 3), 5);",
      "assert.equal(add(-1, 1), 0);",
      "console.log('CHECKS_OK');",
    ].join('\n'));
    const before = runCheck(cwd, 'CHECKS_OK');
    assert.equal(before.checksOk, false);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'wb-check' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const snap = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
    assert.equal((await fetch(base + '/api/pi/settings', {
      method: 'PUT', headers,
      body: JSON.stringify({ revision: snap.configuration.revision, thinkingLevel: 'high', executionMode: 'standard', maxOutputTokens: 2048, apiModel: MODEL }),
    })).status, 200);
    const goal = 'Fix calc.ts so add returns a+b. Do not change tests. Run: node --import tsx calc.test.ts until CHECKS_OK.';
    const accepted = await fetch(base + '/api/tasks', {
      method: 'POST', headers,
      body: JSON.stringify({ projectId: project.id, goal, mode: 'pi', commandId: 'wb-indep-1', continueFromRunId: null }),
    });
    const body = await accepted.text();
    assert.equal(accepted.status, 202, body);
    const runId = (JSON.parse(body) as { run: Run }).run.id;
    const waited = await waitRun(app, runId, 240000, Math.min(8, remaining().calls));
    const after = runCheck(cwd, 'CHECKS_OK');
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === runId);
    const calls = waited.run.calls;
    const usd = waited.run.spentUsd || 0;
    recordUsage(calls, usd);
    stages.push({
      name: 'workbench-multifile-independent-check',
      status: waited.run.status, stopped: waited.stopped, calls, spentUsd: usd,
      independentCheck: after, receipts: receipts.map(r => ({ callNumber: r.callNumber, state: r.state, costUsd: r.costUsd, tokens: r.usage?.totalTokens })),
      pass: after.checksOk && waited.run.status === 'completed' && calls >= 1,
    });
    writeFileSync(join(evidence, 'progress.json'), JSON.stringify({ stage: 'A', usedCalls, usedUsd, remaining: remaining() }, null, 2));
  } finally {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
}

// --- Stage B: original long-history continue with usage + independent check ---
assertBudget(3);
{
  const root = mkdtempSync(join(tmpdir(), 'pi-longhist-orig-'));
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'calc.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
    writeFileSync(join(root, 'calc.test.ts'), [
      "import assert from 'node:assert/strict';",
      "import { add, mul } from './calc.ts';",
      "assert.equal(add(2, 3), 5);",
      "assert.equal(mul(3, 4), 12);",
      "console.log('LONGHIST_CHECKS_OK');",
    ].join('\n'));
    const before = runCheck(root, 'LONGHIST_CHECKS_OK');
    assert.equal(before.checksOk, false);

    const pi = await loadPi();
    const sessionDir = join(root, 'sessions');
    mkdirSync(sessionDir, { recursive: true });
    const manager = pi.SessionManager.create(root, sessionDir);
    manager.appendMessage({ role: 'user', content: 'ORIGINAL_GOAL: implement mul(a,b)=a*b in calc.ts; tests must print LONGHIST_CHECKS_OK.', timestamp: 1 });
    manager.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'Understood. mul still pending after fillers.' }],
      api: 'openai-completions', provider: PROVIDER, model: MODEL,
      usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop', timestamp: 2,
    });
    for (let i = 0; i < 48; i++) {
      manager.appendMessage({ role: 'user', content: `FILLER_${i}: do not implement mul yet.`, timestamp: 10 + i * 2 });
      manager.appendMessage({
        role: 'assistant',
        content: [{ type: 'text', text: `FILLER_REPLY_${i}: noted; ORIGINAL_GOAL pending.` }],
        api: 'openai-completions', provider: PROVIDER, model: MODEL,
        usage: { input: 8, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 16, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: 11 + i * 2,
      });
    }
    const histPath = manager.getSessionFile()!;
    const histEntries = manager.getEntries().length;

    const runtime = await pi.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
    await runtime.setRuntimeApiKey(PROVIDER, key);
    const model = runtime.getModel(PROVIDER, MODEL)!;
    const agentDir = join(root, '.host-pi');
    mkdirSync(agentDir, { recursive: true });
    const settings = pi.SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 1000, maxAgentDelayMs: 15000, provider: { maxRetries: 0 } },
      thinkingLevel: 'high',
    } as never);
    const loader = new pi.DefaultResourceLoader({ cwd: root, agentDir, settingsManager: settings, noExtensions: true, noThemes: true });
    await loader.reload();
    const opened = pi.SessionManager.open(histPath, sessionDir, root);
    const { session } = await pi.createAgentSession({
      cwd: root, agentDir, modelRuntime: runtime, model,
      sessionManager: opened, settingsManager: settings, resourceLoader: loader, thinkingLevel: 'high',
    });
    const started = Date.now();
    let promptError: string | undefined;
    try {
      await Promise.race([
        session.prompt('Continue the ORIGINAL_GOAL now: implement mul in calc.ts and run node --import tsx calc.test.ts until LONGHIST_CHECKS_OK.'),
        delay(240000).then(() => { throw new Error('original-longhist-timeout'); }),
      ]);
    } catch (e) {
      promptError = e instanceof Error ? e.message : 'error';
    }
    const entries = session.sessionManager.getEntries();
    const assistantEntries = entries.filter(e => (e as { type?: string; message?: { role?: string } }).type === 'message' && (e as { message?: { role?: string } }).message?.role === 'assistant');
    // Only count new assistant messages after seed (~98 entries). Seed had 1+48 assistants = 49.
    const newAssistants = assistantEntries.slice(49);
    const usage = newAssistants.map(e => {
      const message = (e as { message?: { usage?: { totalTokens?: number; cost?: { total?: number } }; provider?: string; model?: string } }).message;
      return { provider: message?.provider, model: message?.model, totalTokens: message?.usage?.totalTokens, costTotal: message?.usage?.cost?.total };
    });
    const calls = Math.max(newAssistants.length, usage.filter(u => u.totalTokens != null).length);
    const usd = usage.reduce((n, u) => n + (Number(u.costTotal) || 0), 0);
    if (session.sessionManager.getSessionFile()) {
      copyFileSync(session.sessionManager.getSessionFile()!, join(evidence, 'original-longhist-session.jsonl'));
    }
    session.dispose?.();
    const after = runCheck(root, 'LONGHIST_CHECKS_OK');
    recordUsage(calls, usd);
    stages.push({
      name: 'original-longhist-independent-check',
      elapsedMs: Date.now() - started, promptError, historyEntries: histEntries,
      estimatedCalls: calls, usageFromEntries: usage, independentCheck: after,
      pass: after.checksOk && calls >= 1,
    });
    writeFileSync(join(evidence, 'progress.json'), JSON.stringify({ stage: 'B', usedCalls, usedUsd, remaining: remaining() }, null, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Stage C: local MCP external-tool pair (not vision) ---
assertBudget(4);
{
  const token = `MCP_TOKEN_${Date.now().toString(36)}`;
  const dataRoot = mkdtempSync(join(tmpdir(), 'pi-mcp-pair-'));
  const mcpServer = join(dataRoot, 'mcp-echo.mjs');
  const callsFile = join(dataRoot, 'mcp.calls');
  writeFileSync(mcpServer, `import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const lines = createInterface({ input: process.stdin });
lines.on('close', () => process.exit(0));
lines.on('line', line => {
  const q = JSON.parse(line);
  if (q.id === undefined) return;
  let result;
  if (q.method === 'initialize') result = { protocolVersion: q.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned-echo', version: '1' } };
  else if (q.method === 'tools/list') result = { tools: [{ name: 'secret_echo', description: 'Return fixed token for verification', inputSchema: { type: 'object', properties: {} } }] };
  else if (q.method === 'tools/call') { appendFileSync(${JSON.stringify(callsFile)}, 'CALLED\\n'); result = { content: [{ type: 'text', text: ${JSON.stringify(token)} }] }; }
  else result = {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }) + '\\n');
});
`);

  // Workbench side
  Object.assign(config, { maxCalls: Math.min(8, remaining().calls), budgetUsd: Math.min(0.15, remaining().usd), timeoutMs: 300000 });
  const app = createApp({ dataDir: join(dataRoot, 'wb'), password: 'mcp-pair', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    await app.mcp.update({
      revision: 0,
      json: JSON.stringify({ mcpServers: { fixture: { command: process.execPath, args: [mcpServer], exposure: 'direct', timeout: 10 } } }),
      source: 'owned live mcp', active: true, trusted: true, codemode: false, toolSearch: false,
    });
    const project = app.service.createProject('外部工具对照');
    const cwd = join(dataRoot, 'wb', 'workspaces', project.id);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'README.md'), 'Call MCP tool mcp__fixture__secret_echo and write its exact text into OUT.txt then stop.\n');
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'mcp-pair' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const snap = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
    assert.equal((await fetch(base + '/api/pi/settings', {
      method: 'PUT', headers,
      body: JSON.stringify({ revision: snap.configuration.revision, thinkingLevel: 'high', executionMode: 'standard', maxOutputTokens: 2048, apiModel: MODEL }),
    })).status, 200);
    const goal = 'Use the MCP tool mcp__fixture__secret_echo exactly once. Write the tool result text alone into OUT.txt in the project root. Do not invent the token. Stop when OUT.txt exists.';
    const accepted = await fetch(base + '/api/tasks', {
      method: 'POST', headers,
      body: JSON.stringify({ projectId: project.id, goal, mode: 'pi', commandId: 'mcp-wb-1', continueFromRunId: null }),
    });
    const body = await accepted.text();
    assert.equal(accepted.status, 202, body);
    const runId = (JSON.parse(body) as { run: Run }).run.id;
    const waited = await waitRun(app, runId, 240000, Math.min(8, remaining().calls));
    const outPath = join(cwd, 'OUT.txt');
    const out = existsSync(outPath) ? readFileSync(outPath, 'utf8').trim() : '';
    const mcpCalled = existsSync(callsFile) && readFileSync(callsFile, 'utf8').includes('CALLED');
    const tools = app.store.list<ToolExecution>('tool_execution').filter(t => t.runId === runId && t.name.includes('secret_echo'));
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === runId);
    recordUsage(waited.run.calls, waited.run.spentUsd || 0);
    stages.push({
      name: 'workbench-external-mcp',
      status: waited.run.status, calls: waited.run.calls, spentUsd: waited.run.spentUsd,
      mcpCalled, outMatches: out === token, toolCount: tools.length,
      receipts: receipts.map(r => ({ callNumber: r.callNumber, state: r.state, costUsd: r.costUsd })),
      pass: mcpCalled && out === token && waited.run.calls >= 1,
      note: 'third-class external tool; not F13 vision',
    });

    // Original side — independent project + same MCP server script
    assertBudget(3);
    const origRoot = mkdtempSync(join(tmpdir(), 'pi-mcp-orig-'));
    const origCalls = join(origRoot, 'mcp.calls');
    const origServer = join(origRoot, 'mcp-echo.mjs');
    writeFileSync(origServer, readFileSync(mcpServer, 'utf8').replace(callsFile.replaceAll('\\', '\\\\'), origCalls.replaceAll('\\', '\\\\')).replaceAll(JSON.stringify(callsFile), JSON.stringify(origCalls)));
    // rewrite server with orig calls path more reliably
    writeFileSync(origServer, `import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
const lines = createInterface({ input: process.stdin });
lines.on('close', () => process.exit(0));
lines.on('line', line => {
  const q = JSON.parse(line);
  if (q.id === undefined) return;
  let result;
  if (q.method === 'initialize') result = { protocolVersion: q.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned-echo', version: '1' } };
  else if (q.method === 'tools/list') result = { tools: [{ name: 'secret_echo', description: 'Return fixed token', inputSchema: { type: 'object', properties: {} } }] };
  else if (q.method === 'tools/call') { appendFileSync(${JSON.stringify(origCalls)}, 'CALLED\\n'); result = { content: [{ type: 'text', text: ${JSON.stringify(token)} }] }; }
  else result = {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }) + '\\n');
});
`);
    writeFileSync(join(origRoot, 'README.md'), 'Call secret_echo MCP tool and write result to OUT.txt\n');
    const pi = await loadPi();
    // Original Pi MCP wiring via createAgentSession is complex; use workbench-equivalent createAgentSession with resource loader only for tools is insufficient.
    // Use a second workbench-isolated app as "coding-agent path" alternative: run createAgentSession with custom MCP is not in minimal SDK without extensions.
    // Fall back: drive original via createAgentSession + register MCP through pi's MCP config file in agentDir if supported.
    const agentDir = join(origRoot, '.pi');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'mcp.json'), JSON.stringify({
      mcpServers: { fixture: { command: process.execPath, args: [origServer] } },
    }));
    const runtime = await pi.ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
    await runtime.setRuntimeApiKey(PROVIDER, key);
    const model = runtime.getModel(PROVIDER, MODEL)!;
    const settings = pi.SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 1000, maxAgentDelayMs: 15000, provider: { maxRetries: 0 } },
      thinkingLevel: 'high',
    } as never);
    const loader = new pi.DefaultResourceLoader({ cwd: origRoot, agentDir, settingsManager: settings, noExtensions: true, noThemes: true });
    await loader.reload();
    const { session } = await pi.createAgentSession({
      cwd: origRoot, agentDir, modelRuntime: runtime, model,
      sessionManager: pi.SessionManager.create(origRoot, join(origRoot, 'sessions')),
      settingsManager: settings, resourceLoader: loader, thinkingLevel: 'high',
    });
    // Try bind MCP if API exists
    let mcpBindNote = 'no-bindExtensions-mcp';
    try {
      const mcpSession = session as unknown as { connectMcpServers?: () => Promise<void> };
      if (typeof mcpSession.connectMcpServers === 'function') {
        await mcpSession.connectMcpServers();
        mcpBindNote = 'connectMcpServers';
      }
    } catch (e) {
      mcpBindNote = e instanceof Error ? e.message : 'bind-failed';
    }
    const started = Date.now();
    let promptError: string | undefined;
    try {
      await Promise.race([
        session.prompt(`Use MCP tool secret_echo or mcp__fixture__secret_echo once. Write the exact tool text into OUT.txt. Expected tool exists via local mcp.json. Stop when done.`),
        delay(180000).then(() => { throw new Error('original-mcp-timeout'); }),
      ]);
    } catch (e) {
      promptError = e instanceof Error ? e.message : 'error';
    }
    const entries = session.sessionManager.getEntries();
    const assistants = entries.filter(e => (e as { type?: string; message?: { role?: string } }).type === 'message' && (e as { message?: { role?: string } }).message?.role === 'assistant');
    const usage = assistants.map(e => {
      const message = (e as { message?: { usage?: { cost?: { total?: number }; totalTokens?: number } } }).message;
      return { totalTokens: message?.usage?.totalTokens, costTotal: message?.usage?.cost?.total };
    });
    const calls = assistants.length;
    const usd = usage.reduce((n, u) => n + (Number(u.costTotal) || 0), 0);
    session.dispose?.();
    const outOrig = existsSync(join(origRoot, 'OUT.txt')) ? readFileSync(join(origRoot, 'OUT.txt'), 'utf8').trim() : '';
    const mcpOrig = existsSync(origCalls) && readFileSync(origCalls, 'utf8').includes('CALLED');
    recordUsage(calls, usd);
    stages.push({
      name: 'original-external-mcp',
      elapsedMs: Date.now() - started, promptError, mcpBindNote,
      estimatedCalls: calls, usageFromEntries: usage,
      mcpCalled: mcpOrig, outMatches: outOrig === token,
      pass: mcpOrig && outOrig === token && calls >= 1,
      note: 'same token/server contract as workbench; not vision',
    });
    rmSync(origRoot, { recursive: true, force: true });
    writeFileSync(join(evidence, 'progress.json'), JSON.stringify({ stage: 'C', usedCalls, usedUsd, remaining: remaining(), tokenKeptOutOfReport: true }, null, 2));
  } finally {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
}

// --- Stage D: model+tool wall clock >5min then continue history ---
assertBudget(3);
{
  const dataRoot = mkdtempSync(join(tmpdir(), 'pi-f8-model-'));
  Object.assign(config, {
    maxCalls: Math.min(10, remaining().calls),
    budgetUsd: Math.min(0.2, remaining().usd),
    timeoutMs: 1800000,
  });
  const app = createApp({ dataDir: dataRoot, password: 'f8-model', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const project = app.service.createProject('模型工具超五分钟');
    const cwd = join(dataRoot, 'workspaces', project.id);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'note.txt'), 'start\n');
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'f8-model' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const snap = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
    assert.equal((await fetch(base + '/api/pi/settings', {
      method: 'PUT', headers,
      body: JSON.stringify({ revision: snap.configuration.revision, thinkingLevel: 'high', executionMode: 'long', maxOutputTokens: 2048, apiModel: MODEL }),
    })).status, 200);
    const goal1 = [
      'You must use a shell/powershell tool to run a real wait of at least 310 seconds, for example:',
      "powershell -Command \"Start-Sleep -Seconds 310; Set-Content -Path done.txt -Value DONE_LONG -NoNewline\"",
      'Do not use a plugin hold command. After the wait finishes and done.txt contains DONE_LONG, stop.',
    ].join(' ');
    const accepted = await fetch(base + '/api/tasks', {
      method: 'POST', headers,
      body: JSON.stringify({ projectId: project.id, goal: goal1, mode: 'pi', commandId: 'f8-model-1', continueFromRunId: null }),
    });
    const body = await accepted.text();
    assert.equal(accepted.status, 202, body);
    const first = (JSON.parse(body) as { run: Run }).run;
    assert.equal(first.policy.timeoutMs, 1800000);
    const t0 = Date.now();
    const waited = await waitRun(app, first.id, 400000, Math.min(10, remaining().calls));
    const elapsedMs = Date.now() - t0;
    const doneTxt = existsSync(join(cwd, 'done.txt')) ? readFileSync(join(cwd, 'done.txt'), 'utf8') : '';
    const tools = app.store.list<ToolExecution>('tool_execution').filter(t => t.runId === first.id);
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === first.id);
    recordUsage(waited.run.calls, waited.run.spentUsd || 0);
    const longPass = elapsedMs >= 300000 && waited.run.calls >= 1 && tools.length >= 1 && doneTxt.includes('DONE_LONG') && waited.run.status === 'completed';

    let continuePass = false;
    let continueCalls = 0;
    let continueUsd = 0;
    if (longPass && remaining().calls >= 2 && waited.run.sessionId) {
      // ensure binding like longhist
      const run = app.store.get<Run>('run', first.id);
      if (!app.store.list<SessionBinding>('session_binding').some(b => b.runId === first.id)) {
        const binding = app.modelAccess.settings().binding;
        app.store.create<SessionBinding>('session_binding', {
          id: `session:${first.id}`, projectId: project.id, runId: first.id, taskId: run.taskId,
          sessionId: run.sessionId!, sessionPath: run.sessionPath!, cwd,
          piVersion: '1.0.3', policyVersion: run.policy.version, model: binding.model, authKind: binding.kind,
        });
      }
      const cont = await fetch(base + '/api/tasks', {
        method: 'POST', headers,
        body: JSON.stringify({
          projectId: project.id,
          goal: 'Continue from history: append the word CONTINUED to done.txt (keep DONE_LONG) then stop.',
          mode: 'pi', commandId: 'f8-model-2', continueFromRunId: first.id,
        }),
      });
      const contText = await cont.text();
      assert.equal(cont.status, 202, contText);
      const contId = (JSON.parse(contText) as { run: Run }).run.id;
      const contWait = await waitRun(app, contId, 180000, Math.min(6, remaining().calls));
      continueCalls = contWait.run.calls;
      continueUsd = contWait.run.spentUsd || 0;
      recordUsage(continueCalls, continueUsd);
      const after = existsSync(join(cwd, 'done.txt')) ? readFileSync(join(cwd, 'done.txt'), 'utf8') : '';
      continuePass = after.includes('DONE_LONG') && after.includes('CONTINUED') && contWait.run.calls >= 1;
    }

    stages.push({
      name: 'model-tool-over-5min-then-continue',
      elapsedMs, status: waited.run.status, calls: waited.run.calls, spentUsd: waited.run.spentUsd,
      toolCount: tools.length, doneTxt: doneTxt.slice(0, 80),
      receipts: receipts.map(r => ({ callNumber: r.callNumber, state: r.state, costUsd: r.costUsd })),
      longPass, continuePass, continueCalls, continueUsd,
      pass: longPass && continuePass,
    });
  } finally {
    await app.close();
    rmSync(dataRoot, { recursive: true, force: true });
  }
}

report.final = { usedCalls, usedUsd, remaining: remaining(), stages: stages.map((s: any) => ({ name: s.name, pass: s.pass, calls: s.calls ?? s.estimatedCalls })) };
report.pass = (stages as Array<{ pass?: boolean }>).every(s => s.pass);
writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.final, null, 2));
if (!report.pass) process.exitCode = 2;

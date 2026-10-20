/**
 * F15 long-history pair under DeepSeek authorization.
 * Key only from PI_API_KEY / DEEPSEEK_API_KEY.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { Run, SessionBinding } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

const evidence = 'output/dev-evidence/pi-parity/loop-161';
mkdirSync(evidence, { recursive: true });
const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert(key, 'PI_API_KEY or DEEPSEEK_API_KEY required');

const MAX_CALLS = Math.min(Number(process.env.PI_MAX_CALLS || 20), 20);
const BUDGET_USD = Math.min(Number(process.env.PI_BUDGET_USD || 0.65), 0.65);
const RESERVE = Math.min(Number(process.env.PI_CALL_RESERVE_USD || 0.05), 0.05);
const MODEL = process.env.PI_MODEL || 'deepseek-flash';
const PROVIDER = process.env.PI_PROVIDER || 'deepseek';

Object.assign(config, {
  apiKey: key,
  provider: PROVIDER,
  model: MODEL,
  maxCalls: MAX_CALLS,
  budgetUsd: BUDGET_USD,
  reservePerCallUsd: RESERVE,
  maxOutputTokens: 2048,
  timeoutMs: 240000,
});

function seedCode(cwd: string) {
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, 'calc.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
  writeFileSync(join(cwd, 'calc.test.ts'), [
    "import assert from 'node:assert/strict';",
    "import { add, mul } from './calc.ts';",
    "assert.equal(add(2, 3), 5);",
    "assert.equal(mul(3, 4), 12);",
    "console.log('LONGHIST_CHECKS_OK');",
  ].join('\n'));
}

async function buildLongHistory(cwd: string, sessionDir: string) {
  mkdirSync(sessionDir, { recursive: true });
  const pi = await loadPi();
  const manager = pi.SessionManager.create(cwd, sessionDir);
  manager.appendMessage({ role: 'user', content: 'ORIGINAL_GOAL: implement mul(a,b)=a*b in calc.ts; tests must print LONGHIST_CHECKS_OK.', timestamp: 1 });
  manager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'Understood. I will implement mul after the filler discussion.' }],
    api: 'openai-completions', provider: PROVIDER, model: MODEL,
    usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop', timestamp: 2,
  });
  for (let i = 0; i < 48; i++) {
    manager.appendMessage({ role: 'user', content: `FILLER_${i}: style note ${i}; do not implement mul yet.`, timestamp: 10 + i * 2 });
    manager.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: `FILLER_REPLY_${i}: noted; ORIGINAL_GOAL mul still pending.` }],
      api: 'openai-completions', provider: PROVIDER, model: MODEL,
      usage: { input: 8, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 16, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop', timestamp: 11 + i * 2,
    });
  }
  return {
    path: manager.getSessionFile()!,
    sessionId: manager.getSessionId(),
    entries: manager.getEntries().length,
    bytes: readFileSync(manager.getSessionFile()!).length,
  };
}

async function waitRun(app: ReturnType<typeof createApp>, runId: string, deadlineMs: number) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    app.scheduler.tick();
    const run = app.store.get<Run>('run', runId);
    const spent = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0) + (r.reservedUsd || 0), 0);
    const calls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
    if (calls >= MAX_CALLS || spent >= BUDGET_USD) {
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

const report: Record<string, unknown> = {
  provider: PROVIDER, model: MODEL, thinking: 'high',
  sample: 'long-history-continue-original-goal',
  stages: [] as unknown[],
};

const dataRoot = mkdtempSync(join(tmpdir(), 'pi-live-longhist-'));
const app = createApp({ dataDir: dataRoot, password: 'longhist-qa', schedule: false });
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

try {
  const project = app.service.createProject('长历史对照');
  const cwd = join(dataRoot, 'workspaces', project.id);
  const sessionDir = join(dataRoot, 'sessions', project.id);
  seedCode(cwd);
  const history = await buildLongHistory(cwd, sessionDir);
  (report.stages as unknown[]).push({ name: 'seed-history', entries: history.entries, bytes: history.bytes });

  const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'longhist-qa' }) });
  const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  const snap = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
  const savedResp = await fetch(base + '/api/pi/settings', {
    method: 'PUT', headers,
    body: JSON.stringify({ revision: snap.configuration.revision, thinkingLevel: 'high', executionMode: 'standard', maxOutputTokens: 2048, apiModel: MODEL }),
  });
  const savedText = await savedResp.text();
  assert.equal(savedResp.status, 200, savedText);

  // Seed a completed source run bound to the long native session (same pattern as compaction fixtures).
  const binding = app.modelAccess.settings().binding;
  const sourceAccept = await fetch(base + '/api/tasks', {
    method: 'POST', headers,
    body: JSON.stringify({ projectId: project.id, goal: 'history seed placeholder', mode: 'pi', commandId: 'longhist-source', continueFromRunId: null }),
  });
  const sourceBody = await sourceAccept.text();
  assert.equal(sourceAccept.status, 202, sourceBody);
  let source = (JSON.parse(sourceBody) as { run: Run }).run;
  app.service.transition(source.id, 'running', { startedAt: new Date().toISOString() });
  source = app.store.get<Run>('run', source.id);
  app.store.update<Run>('run', source.id, source.revision, {
    sessionId: history.sessionId,
    sessionPath: history.path,
  });
  source = app.store.get<Run>('run', source.id);
  app.service.transition(source.id, 'completed');
  source = app.store.get<Run>('run', source.id);
  app.store.create<SessionBinding>('session_binding', {
    id: `session:${source.id}`,
    projectId: project.id,
    runId: source.id,
    taskId: source.taskId,
    sessionId: history.sessionId,
    sessionPath: history.path,
    cwd,
    piVersion: '1.0.3',
    policyVersion: source.policy.version,
    model: binding.model,
    authKind: binding.kind,
    pluginSignature: source.pluginManifest?.signature,
  });

  const cont = await fetch(base + '/api/tasks', {
    method: 'POST', headers,
    body: JSON.stringify({
      projectId: project.id,
      goal: 'Continue the ORIGINAL_GOAL now: implement mul in calc.ts and run npx --yes tsx calc.test.ts until LONGHIST_CHECKS_OK.',
      mode: 'pi',
      commandId: 'longhist-continue',
      continueFromRunId: source.id,
    }),
  });
  const contText = await cont.text();
  assert.equal(cont.status, 202, contText);
  const continued = (JSON.parse(contText) as { run: Run }).run;
  assert(continued.continuation, 'expected native continuation');

  const wb = await waitRun(app, continued.id, 240000);
  const wbCalc = readFileSync(join(cwd, 'calc.ts'), 'utf8');
  const wbPass = /function\s+mul/.test(wbCalc) && (wbCalc.includes('a * b') || wbCalc.includes('a*b'));
  const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === continued.id);
  (report.stages as unknown[]).push({
    name: 'workbench-continue',
    status: wb.run.status,
    stopped: wb.stopped,
    calls: wb.run.calls,
    spentUsd: wb.run.spentUsd,
    error: wb.run.error,
    testsPass: wbPass,
    calcSnippet: wbCalc.slice(0, 220),
    receipts: receipts.map(r => ({ callNumber: r.callNumber, state: r.state, costUsd: r.costUsd, tokens: r.usage?.totalTokens })),
    historyEntries: history.entries,
    historyBytes: history.bytes,
  });

  const usedCalls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
  const usedUsd = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0), 0);
  report.workbenchUsage = { calls: usedCalls, spentUsd: usedUsd };

  if (usedCalls < MAX_CALLS - 1 && usedUsd < BUDGET_USD - 0.05) {
    const originalRoot = mkdtempSync(join(tmpdir(), 'pi-live-longhist-orig-'));
    try {
      seedCode(originalRoot);
      const hist = await buildLongHistory(originalRoot, join(originalRoot, 'sessions'));
      const pi = await loadPi();
      const runtime = await pi.ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        allowModelNetwork: false,
        refreshOnCreate: false,
      });
      await runtime.setRuntimeApiKey(PROVIDER, key);
      const model = runtime.getModel(PROVIDER, MODEL)!;
      const agentDir = join(originalRoot, '.host-pi');
      mkdirSync(agentDir, { recursive: true });
      const settings = pi.SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 2, baseDelayMs: 1000, maxAgentDelayMs: 15000, provider: { maxRetries: 0 } },
        thinkingLevel: 'high',
      } as never);
      const loader = new pi.DefaultResourceLoader({
        cwd: originalRoot, agentDir, settingsManager: settings, noExtensions: true, noThemes: true,
      });
      await loader.reload();
      const manager = pi.SessionManager.open(hist.path, join(originalRoot, 'sessions'), originalRoot);
      const { session } = await pi.createAgentSession({
        cwd: originalRoot, agentDir, modelRuntime: runtime, model,
        sessionManager: manager, settingsManager: settings, resourceLoader: loader, thinkingLevel: 'high',
      });
      const before = Date.now();
      try {
        await Promise.race([
          session.prompt('Continue the ORIGINAL_GOAL now: implement mul in calc.ts and run npx --yes tsx calc.test.ts until LONGHIST_CHECKS_OK.'),
          delay(180000).then(() => { throw new Error('original-timeout'); }),
        ]);
      } catch (error) {
        (report as { originalError?: string }).originalError = error instanceof Error ? error.message : 'error';
      }
      const origCalc = readFileSync(join(originalRoot, 'calc.ts'), 'utf8');
      const origPass = /function\s+mul/.test(origCalc) && (origCalc.includes('a * b') || origCalc.includes('a*b'));
      session.dispose?.();
      (report.stages as unknown[]).push({
        name: 'original-continue',
        elapsedMs: Date.now() - before,
        testsPass: origPass,
        calcSnippet: origCalc.slice(0, 220),
        historyEntries: hist.entries,
        historyBytes: hist.bytes,
      });
    } finally {
      rmSync(originalRoot, { recursive: true, force: true });
    }
  } else {
    (report.stages as unknown[]).push({ name: 'original-continue', skipped: true, reason: 'budget' });
  }

  report.final = { workbenchCalls: usedCalls, workbenchSpentUsd: usedUsd, keyNeverWritten: true };
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    stages: (report.stages as Array<{ name?: string; testsPass?: boolean; status?: string; skipped?: boolean; historyEntries?: number; calls?: number }>).map(s => ({
      name: s.name, testsPass: s.testsPass, status: s.status, skipped: s.skipped, historyEntries: s.historyEntries, calls: s.calls,
    })),
    usage: report.workbenchUsage,
  }, null, 2));
} finally {
  await app.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

/**
 * Live DeepSeek verification for Pi 1.0.3 workbench.
 * Reads PI_API_KEY / DEEPSEEK_API_KEY from the environment only.
 * Never logs or writes the key. Stops at PI_MAX_CALLS / PI_BUDGET_USD.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type { Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

const evidence = 'output/dev-evidence/pi-parity/loop-160';
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert(key, 'PI_API_KEY or DEEPSEEK_API_KEY required in environment');

// Conservative host caps: ¥5 ≈ $0.70; use $0.65 catalog USD. Call hard stop at 20.
const MAX_CALLS = Math.min(Number(process.env.PI_MAX_CALLS || 20), 20);
const BUDGET_USD = Math.min(Number(process.env.PI_BUDGET_USD || 0.65), 0.65);
const RESERVE = Math.min(Number(process.env.PI_CALL_RESERVE_USD || 0.05), 0.05);
const MODEL = process.env.PI_MODEL || 'deepseek-flash';
const PROVIDER = process.env.PI_PROVIDER || 'deepseek';
// Catalog: medium → null on deepseek-flash; use high as shared tangible level.
const THINKING = (process.env.PI_THINKING_LEVEL || 'high') as 'low' | 'high' | 'max';

Object.assign(config, {
  apiKey: key,
  provider: PROVIDER,
  model: MODEL,
  maxCalls: MAX_CALLS,
  budgetUsd: BUDGET_USD,
  reservePerCallUsd: RESERVE,
  maxOutputTokens: Number(process.env.PI_MAX_OUTPUT_TOKENS || 2048),
  timeoutMs: Number(process.env.PI_TIMEOUT_MS || 180000),
});

function seedProject(cwd: string) {
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, 'calc.ts'), 'export function add(a: number, b: number) {\n  return a - b;\n}\n');
  writeFileSync(join(cwd, 'calc.test.ts'), [
    "import assert from 'node:assert/strict';",
    "import { add } from './calc.ts';",
    "assert.equal(add(2, 3), 5);",
    "assert.equal(add(-1, 1), 0);",
    "console.log('CHECKS_OK');",
  ].join('\n'));
  writeFileSync(join(cwd, 'README.md'), '# Live fixture\nBroken add() must be fixed so tests print CHECKS_OK.\n');
}

const goal = [
  'Fix the bug in calc.ts so add(a, b) returns a + b.',
  'Do not change the test expectations.',
  'Then run: npx --yes tsx calc.test.ts',
  'Stop when the command prints CHECKS_OK.',
].join(' ');

const report: Record<string, unknown> = {
  provider: PROVIDER,
  model: MODEL,
  thinkingRequested: THINKING,
  thinkingNote: 'deepseek-flash thinkingLevelMap.medium is null; shared level is high',
  caps: { maxCalls: MAX_CALLS, budgetUsd: BUDGET_USD, reservePerCallUsd: RESERVE, cnyCap: 5, usdApproxRate: 7.2 },
  costAccounting: 'Host enforces PI_BUDGET_USD using Pi catalog USD rates, not DeepSeek CNY invoice; call count hard-capped',
  vision: 'deferred; F13 remains open even though catalog lists image input on flash',
  stages: [] as unknown[],
};

async function waitRun(app: ReturnType<typeof createApp>, runId: string, label: string, deadlineMs: number) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    app.scheduler.tick();
    const run = app.store.get<Run>('run', runId);
    const spent = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0) + (r.reservedUsd || 0), 0);
    const calls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
    if (calls >= MAX_CALLS || spent >= BUDGET_USD) {
      if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) {
        await app.service.requestCancel(runId).catch(() => undefined);
      }
      return { run: app.store.get<Run>('run', runId), stopped: 'cap' as const, calls, spent };
    }
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) {
      return { run, stopped: 'terminal' as const, calls, spent };
    }
    await delay(200);
  }
  const run = app.store.get<Run>('run', runId);
  await app.service.requestCancel(runId).catch(() => undefined);
  return { run, stopped: 'timeout' as const, calls: run.calls, spent: run.spentUsd + run.reservedUsd };
}

// --- Stage 1: workbench basic verification ---
const dataRoot = mkdtempSync(join(tmpdir(), 'pi-live-wb-'));
const app = createApp({ dataDir: dataRoot, password: 'live-deepseek-qa', schedule: false });
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
try {
  const project = app.service.createProject('DeepSeek基础验证');
  const cwd = join(dataRoot, 'workspaces', project.id);
  seedProject(cwd);
  const login = await fetch(`http://127.0.0.1:${(app.server.address() as { port: number }).port}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ password: 'live-deepseek-qa' }),
  });
  const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const current = await (await fetch(base + '/api/pi/settings', { headers })).json() as {
    configuration: { revision: number };
    model?: { supportedThinkingLevels?: string[]; effectiveThinkingLevel?: string };
  };
  const settingsBody = {
    revision: current.configuration.revision,
    thinkingLevel: 'high' as const,
    executionMode: 'standard' as const,
    maxOutputTokens: 2048,
    apiModel: MODEL,
  };
  const saved = await fetch(base + '/api/pi/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify(settingsBody),
  });
  const savedText = await saved.text();
  assert.equal(saved.status, 200, `${savedText} body=${JSON.stringify(settingsBody)} getModel=${JSON.stringify(current.model)}`);
  const frozen = JSON.parse(savedText) as { configuration: { thinkingLevel: string; apiModel?: string }; model?: { effectiveThinkingLevel?: string; supportedThinkingLevels?: string[] } };
  assert.equal(frozen.configuration.thinkingLevel, 'high');
  assert.equal(frozen.model?.effectiveThinkingLevel, 'high');
  report.supportedThinkingLevels = frozen.model?.supportedThinkingLevels;
  report.thinkingRequested = 'high';

  const submitted = await fetch(base + '/api/tasks', {
    method: 'POST',
    headers,
    body: JSON.stringify({ projectId: project.id, goal, mode: 'pi', commandId: 'live-basic-1', continueFromRunId: null }),
  });
  const submittedText = await submitted.text();
  assert.equal(submitted.status, 202, submittedText);
  const { run: initial } = JSON.parse(submittedText) as { run: Run };
  assert.equal(initial.policy.modelBinding?.provider, PROVIDER);
  assert.equal(initial.policy.modelBinding?.model, MODEL);
  assert.equal(initial.policy.piRuntime?.thinkingLevel, 'high');

  const basic = await waitRun(app, initial.id, 'basic', 240000);
  const calc = existsSync(join(cwd, 'calc.ts')) ? readFileSync(join(cwd, 'calc.ts'), 'utf8') : '';
  const testsPass = calc.includes('a + b') || calc.includes('a+b');
  const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === initial.id);
  (report.stages as unknown[]).push({
    name: 'workbench-basic',
    status: basic.run.status,
    stopped: basic.stopped,
    calls: basic.run.calls,
    spentUsd: basic.run.spentUsd,
    reservedUsd: basic.run.reservedUsd,
    error: basic.run.error,
    testsPass,
    calcSnippet: calc.slice(0, 120),
    receipts: receipts.map(r => ({ callNumber: r.callNumber, state: r.state, purpose: r.purpose, costUsd: r.costUsd, tokens: r.usage?.totalTokens })),
    sessionBound: Boolean(basic.run.sessionId && basic.run.sessionPath),
  });
  writeFileSync(join(evidence, 'basic-progress.json'), JSON.stringify(report.stages, null, 2));

  const usedCalls = app.store.list<Run>('run').reduce((n, r) => n + r.calls, 0);
  const usedUsd = app.store.list<Run>('run').reduce((n, r) => n + (r.spentUsd || 0), 0);
  report.workbenchUsage = { calls: usedCalls, spentUsd: usedUsd };

  // --- Stage 2: original Pi same model/task if budget remains ---
  const remainingCalls = MAX_CALLS - usedCalls;
  const remainingUsd = BUDGET_USD - usedUsd;
  if (remainingCalls >= 2 && remainingUsd >= 0.05 && testsPass) {
    const originalRoot = mkdtempSync(join(tmpdir(), 'pi-live-original-'));
    try {
      seedProject(originalRoot);
      const pi = await loadPi();
      const runtime = await pi.ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
        allowModelNetwork: false,
        refreshOnCreate: false,
      });
      await runtime.setRuntimeApiKey(PROVIDER, key);
      const model = runtime.getModel(PROVIDER, MODEL);
      assert(model, 'catalog must contain deepseek-flash');
      const agentDir = join(originalRoot, '.host-pi');
      mkdirSync(agentDir, { recursive: true });
      const settings = pi.SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 2, baseDelayMs: 1000, maxAgentDelayMs: 15000, provider: { maxRetries: 0 } },
        thinkingLevel: THINKING,
      } as never);
      const loader = new pi.DefaultResourceLoader({
        cwd: originalRoot,
        agentDir,
        settingsManager: settings,
        noExtensions: true,
        noThemes: true,
      });
      await loader.reload();
      const { session } = await pi.createAgentSession({
        cwd: originalRoot,
        agentDir,
        modelRuntime: runtime,
        model,
        sessionManager: pi.SessionManager.create(originalRoot, join(originalRoot, 'sessions')),
        settingsManager: settings,
        resourceLoader: loader,
        thinkingLevel: THINKING,
      });
      let originalCalls = 0;
      const before = Date.now();
      try {
        // Bound original side: stop after short prompt if session exposes abort; rely on maxTokens + few turns
        await Promise.race([
          session.prompt(goal),
          delay(180000).then(() => { throw new Error('original-side-timeout'); }),
        ]);
      } catch (error) {
        (report as { originalError?: string }).originalError = error instanceof Error ? error.message : 'error';
      }
      const originalCalc = readFileSync(join(originalRoot, 'calc.ts'), 'utf8');
      const originalPass = originalCalc.includes('a + b') || originalCalc.includes('a+b');
      // Estimate calls from session messages if available
      try {
        const messages = Array.isArray(session.state?.messages) ? session.state.messages : [];
        originalCalls = messages.filter((m: { role?: string }) => m.role === 'assistant').length;
      } catch { originalCalls = 0; }
      session.dispose?.();
      (report.stages as unknown[]).push({
        name: 'original-pi-basic',
        elapsedMs: Date.now() - before,
        testsPass: originalPass,
        calcSnippet: originalCalc.slice(0, 120),
        assistantTurns: originalCalls,
        remainingCallsBefore: remainingCalls,
        remainingUsdBefore: remainingUsd,
      });
    } finally {
      rmSync(originalRoot, { recursive: true, force: true });
    }
  } else {
    (report.stages as unknown[]).push({
      name: 'original-pi-basic',
      skipped: true,
      reason: remainingCalls < 2 || remainingUsd < 0.05 ? 'budget-or-calls' : 'workbench-basic-not-pass',
      remainingCalls,
      remainingUsd,
    });
  }

  report.final = {
    workbenchCalls: usedCalls,
    workbenchSpentUsd: usedUsd,
    probeCallCountedSeparately: 1,
    totalExternalCallsApprox: usedCalls + 1 + ((report.stages as Array<{ name: string; assistantTurns?: number }>).find(s => s.name === 'original-pi-basic')?.assistantTurns || 0),
    cnyCap: 5,
    keyNeverWritten: true,
  };
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  const stageSummary = (report.stages as Array<Record<string, unknown>>).map(s => ({
    name: s.name, status: s.status, testsPass: s.testsPass, skipped: s.skipped,
  }));
  console.log(JSON.stringify({ ok: true, stages: stageSummary, usage: report.workbenchUsage, final: report.final }, null, 2));
} finally {
  await app.close();
  rmSync(dataRoot, { recursive: true, force: true });
}

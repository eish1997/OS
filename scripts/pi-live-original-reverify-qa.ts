/**
 * Limited re-verify: original Pi multi-file pair with auditable usage + independent check.
 * Does not re-claim LOOP-160/161 original sides. Caps against cumulative prior usage.
 * Key only from PI_API_KEY / DEEPSEEK_API_KEY.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadPi } from '../server/pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';

const evidence = 'output/dev-evidence/pi-parity/loop-163';
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert(key, 'PI_API_KEY or DEEPSEEK_API_KEY required');

const PRIOR_CALLS = Number(process.env.PI_PRIOR_CALLS || 11);
const PRIOR_USD = Number(process.env.PI_PRIOR_USD || 0.004505508);
const CAP_CALLS = Math.min(Number(process.env.PI_MAX_CALLS || 20), 20);
const CAP_USD = Math.min(Number(process.env.PI_BUDGET_USD || 0.65), 0.65);
const REMAINING_CALLS = Math.max(0, CAP_CALLS - PRIOR_CALLS);
const REMAINING_USD = Math.max(0, CAP_USD - PRIOR_USD);
const MODEL = process.env.PI_MODEL || 'deepseek-flash';
const PROVIDER = process.env.PI_PROVIDER || 'deepseek';
const THIS_CALL_CAP = Math.min(6, REMAINING_CALLS);

assert(THIS_CALL_CAP >= 2, `insufficient remaining calls: prior=${PRIOR_CALLS} remaining=${REMAINING_CALLS}`);

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

function runIndependentCheck(cwd: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'calc.test.ts'], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, npm_config_yes: 'true' },
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').slice(0, 2000),
    stderr: (result.stderr || '').slice(0, 2000),
    checksOk: (result.stdout || '').includes('CHECKS_OK') && result.status === 0,
  };
}

const goal = [
  'Fix the bug in calc.ts so add(a, b) returns a + b.',
  'Do not change the test expectations.',
  'Then run the test file with: node --import tsx calc.test.ts',
  'Stop when the command prints CHECKS_OK.',
].join(' ');

const report: Record<string, unknown> = {
  purpose: 're-verify original multi-file with usage + independent check; explain assistantTurns:0',
  prior: { calls: PRIOR_CALLS, usd: PRIOR_USD },
  caps: { totalCalls: CAP_CALLS, totalUsd: CAP_USD, thisCallCap: THIS_CALL_CAP, remainingCalls: REMAINING_CALLS, remainingUsd: REMAINING_USD },
  provider: PROVIDER,
  model: MODEL,
  thinking: 'high',
  assistantTurnsExplanation:
    'LOOP-160 counted buildSessionContext().messages; correct surface is session.state.messages and SessionManager entries with usage. Zero there was a meter bug.',
};

const root = mkdtempSync(join(tmpdir(), 'pi-orig-reverify-'));
try {
  seedProject(root);
  const beforeCheck = runIndependentCheck(root);
  assert.equal(beforeCheck.checksOk, false, 'seed must fail independent check');

  const pi = await loadPi();
  const runtime = await pi.ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  await runtime.setRuntimeApiKey(PROVIDER, key);
  const model = runtime.getModel(PROVIDER, MODEL);
  assert(model, 'deepseek-flash required');
  const agentDir = join(root, '.host-pi');
  mkdirSync(agentDir, { recursive: true });
  const settings = pi.SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 1, baseDelayMs: 1000, maxAgentDelayMs: 15000, provider: { maxRetries: 0 } },
    thinkingLevel: 'high',
  } as never);
  const loader = new pi.DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager: settings,
    noExtensions: true,
    noThemes: true,
  });
  await loader.reload();
  const sessionDir = join(root, 'sessions');
  const { session } = await pi.createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime: runtime,
    model,
    sessionManager: pi.SessionManager.create(root, sessionDir),
    settingsManager: settings,
    resourceLoader: loader,
    thinkingLevel: 'high',
  });

  let providerResponses = 0;
  const unsub = session.subscribe((event: { type?: string }) => {
    if (event.type === 'message_end' || event.type === 'turn_end' || event.type === 'agent_end') {
      // counted below from state/entries
    }
  });

  const started = Date.now();
  let promptError: string | undefined;
  try {
    await Promise.race([
      session.prompt(goal),
      delay(180000).then(() => {
        throw new Error('original-reverify-timeout');
      }),
    ]);
  } catch (error) {
    promptError = error instanceof Error ? error.message : 'error';
  }

  const messages = Array.isArray(session.state?.messages) ? session.state.messages : [];
  const assistantFromState = messages.filter((m: { role?: string }) => m.role === 'assistant');
  const sessionFile = session.sessionManager?.getSessionFile?.() ?? null;
  const entries = session.sessionManager?.getEntries?.() ?? [];
  const assistantEntries = entries.filter((e) => {
    const row = e as { type?: string; message?: { role?: string } };
    return row.type === 'message' && row.message?.role === 'assistant';
  });
  const usageFromEntries = assistantEntries.map((e) => {
    const message = (e as { message?: { usage?: { totalTokens?: number; cost?: { total?: number } }; provider?: string; model?: string } }).message;
    return {
      provider: message?.provider,
      model: message?.model,
      totalTokens: message?.usage?.totalTokens,
      costTotal: message?.usage?.cost?.total,
    };
  });
  const estimatedCalls = Math.max(assistantFromState.length, assistantEntries.length, usageFromEntries.filter(u => u.totalTokens != null).length);
  providerResponses = estimatedCalls;

  if (sessionFile && existsSync(sessionFile)) {
    copyFileSync(sessionFile, join(evidence, 'original-session.jsonl'));
  }

  unsub?.();
  session.dispose?.();

  const afterCheck = runIndependentCheck(root);
  const calc = readFileSync(join(root, 'calc.ts'), 'utf8');

  report.stage = {
    name: 'original-multi-file-reverify',
    elapsedMs: Date.now() - started,
    promptError,
    assistantFromState: assistantFromState.length,
    assistantEntries: assistantEntries.length,
    estimatedModelCalls: estimatedCalls,
    usageFromEntries,
    calcSnippet: calc.slice(0, 160),
    contentLooksFixed: calc.includes('a + b') || calc.includes('a+b'),
    independentCheckBefore: { status: beforeCheck.status, checksOk: beforeCheck.checksOk },
    independentCheckAfter: {
      status: afterCheck.status,
      checksOk: afterCheck.checksOk,
      stdoutTail: afterCheck.stdout.slice(-500),
      stderrTail: afterCheck.stderr.slice(-500),
    },
    sessionArtifact: existsSync(join(evidence, 'original-session.jsonl')),
    withinThisCap: estimatedCalls <= THIS_CALL_CAP,
  };

  report.pass = Boolean(
    afterCheck.checksOk
    && estimatedCalls >= 1
    && (report.stage as { withinThisCap: boolean }).withinThisCap,
  );
  report.cumulativeAfter = {
    priorCalls: PRIOR_CALLS,
    thisEstimatedCalls: estimatedCalls,
    totalEstimatedMin: PRIOR_CALLS + estimatedCalls,
    priorUsd: PRIOR_USD,
    thisUsdFromEntries: usageFromEntries.reduce((n, u) => n + (Number(u.costTotal) || 0), 0),
    note: 'Original-side USD from Pi message usage.cost.total when present; DeepSeek invoice unknown',
  };

  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.pass,
    estimatedCalls,
    independentCheck: afterCheck.checksOk,
    assistantFromState: assistantFromState.length,
    assistantEntries: assistantEntries.length,
    promptError,
  }, null, 2));
  if (!report.pass) process.exitCode = 2;
} finally {
  rmSync(root, { recursive: true, force: true });
}

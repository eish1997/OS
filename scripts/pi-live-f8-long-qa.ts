/**
 * F8 under DeepSeek authorization: real worker execution >5 minutes.
 * Uses hold_long plugin command (0 model calls) with live DeepSeek config frozen.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Run } from '../shared/contracts.js';

const evidence = 'output/dev-evidence/pi-parity/loop-162';
mkdirSync(evidence, { recursive: true });
const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
assert(key, 'PI_API_KEY or DEEPSEEK_API_KEY required');

Object.assign(config, {
  apiKey: key,
  provider: process.env.PI_PROVIDER || 'deepseek',
  model: process.env.PI_MODEL || 'deepseek-flash',
  maxCalls: Math.min(Number(process.env.PI_MAX_CALLS || 20), 20),
  budgetUsd: Math.min(Number(process.env.PI_BUDGET_USD || 0.65), 0.65),
  reservePerCallUsd: Math.min(Number(process.env.PI_CALL_RESERVE_USD || 0.05), 0.05),
  maxOutputTokens: 2048,
  timeoutMs: 300000,
});

const root = mkdtempSync(join(tmpdir(), 'pi-live-f8-'));
const source = join(root, 'source');
mkdirSync(source);
writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'owned-long-task-fixture', pi: { extensions: ['hold.mjs'] } }));
writeFileSync(join(source, 'hold.mjs'), `export default pi => pi.registerCommand('hold_long', { description:'Controlled long-running fixture', handler:async () => { await new Promise(resolve=>setTimeout(resolve,310000)); } });`);

const app = createApp({ dataDir: join(root, 'data'), password: 'f8-long-qa', schedule: false });
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
try {
  const state = app.plugins.state;
  const operation = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'f8-install', trusted: true });
  const pkg = await inspectPlugin(source, app.plugins.agentDir);
  state.phase(operation.id, 'committing', 'Owned fixture');
  state.commit(operation.id, [pkg]);
  state.configure(state.configuration().revision, pkg.id, true);

  const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'f8-long-qa' }) });
  const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  const snap = await (await fetch(base + '/api/pi/settings', { headers })).json() as { configuration: { revision: number } };
  const configured = await fetch(base + '/api/pi/settings', {
    method: 'PUT', headers,
    body: JSON.stringify({ revision: snap.configuration.revision, thinkingLevel: 'high', executionMode: 'long', maxOutputTokens: 2048, apiModel: config.model }),
  });
  assert.equal(configured.status, 200, await configured.text());

  const project = app.service.createProject('授权下超过五分钟执行');
  const accepted = await fetch(base + '/api/tasks', {
    method: 'POST', headers,
    body: JSON.stringify({ projectId: project.id, goal: '/hold_long', mode: 'pi', commandId: 'f8-wall-clock', continueFromRunId: null }),
  });
  const acceptedText = await accepted.text();
  assert.equal(accepted.status, 202, acceptedText);
  const { run: initial } = JSON.parse(acceptedText) as { run: Run };
  assert.equal(initial.policy.timeoutMs, 1800000);
  assert.equal(initial.policy.modelBinding?.provider, 'deepseek');
  assert.equal(initial.policy.modelBinding?.model, 'deepseek-flash');

  let lastMinute = -1;
  const deadline = Date.now() + 350000;
  let terminal: Run | undefined;
  while (Date.now() < deadline) {
    app.scheduler.tick();
    const run = app.store.get<Run>('run', initial.id);
    const elapsedMs = run.startedAt ? Date.now() - Date.parse(run.startedAt) : 0;
    const minute = Math.floor(elapsedMs / 60000);
    if (minute !== lastMinute) {
      lastMinute = minute;
      const progress = { runId: run.id, status: run.status, elapsedMs, calls: run.calls, model: run.policy.modelBinding?.model };
      writeFileSync(join(evidence, 'progress.json'), JSON.stringify(progress, null, 2));
      console.log(JSON.stringify(progress));
    }
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) {
      terminal = run;
      break;
    }
    await delay(1000);
  }
  assert(terminal, 'F8 did not finish within observation window');
  assert.equal(terminal.status, 'completed', terminal.error ?? 'f8');
  const elapsedSafe = terminal.startedAt ? Date.now() - Date.parse(terminal.startedAt) : 0;
  assert(elapsedSafe >= 310000 || (terminal.startedAt && Date.now() - Date.parse(terminal.startedAt) >= 310000));
  // Re-read after loop exit for accurate elapsed near completion
  const done = app.store.get<Run>('run', initial.id);
  const doneElapsed = done.startedAt ? Date.now() - Date.parse(done.startedAt) : 0;
  assert(doneElapsed >= 300000, `expected >=5min, got ${doneElapsed}`);
  assert.equal(done.calls, 0);
  assert.equal(done.timedOutAt, undefined);
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({
    closed: 'DeepSeek 授权配置下真实 worker 执行超过 5 分钟；历史保留；模型请求 0（插件 hold 命令）',
    provider: done.policy.modelBinding?.provider,
    model: done.policy.modelBinding?.model,
    thinking: done.policy.piRuntime?.thinkingLevel,
    elapsedMs: doneElapsed,
    timeoutMs: done.policy.timeoutMs,
    calls: done.calls,
    spentUsd: done.spentUsd,
    sessionSaved: Boolean(done.sessionId && done.sessionPath),
    status: done.status,
    nextStep: '可在同一任务额度下追加或新开目标；本次未消耗模型次数',
    keyNeverWritten: true,
  }, null, 2));
  console.log(JSON.stringify({ ok: true, elapsedMs: doneElapsed, calls: done.calls, status: done.status }, null, 2));
} finally {
  await app.close();
}

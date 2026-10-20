import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Run } from '../shared/contracts.js';

// Explicit slow QA entry point; no real model and no user's project or service.
const evidence = 'output/dev-evidence/pi-parity/long-task'; mkdirSync(evidence, { recursive: true });
const root = mkdtempSync(join(tmpdir(), 'pi-long-task-')); const source = join(root, 'source'); mkdirSync(source);
writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'owned-long-task-fixture', pi: { extensions: ['hold.mjs'] } }));
writeFileSync(join(source, 'hold.mjs'), `export default pi => pi.registerCommand('hold_long', { description:'Controlled long-running fixture', handler:async () => { await new Promise(resolve=>setTimeout(resolve,310000)); } });`);
Object.assign(config, { apiKey: 'offline-long-task', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 2, budgetUsd: 2, reservePerCallUsd: 1, timeoutMs: 300000 });
const app = createApp({ dataDir: join(root, 'data'), password: 'long-task-fixture', schedule: false });
await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
try {
  const state = app.plugins.state;
  const operation = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'long-fixture-install', trusted: true });
  const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(operation.id, 'committing', 'Owned fixture'); state.commit(operation.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
  const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'long-task-fixture' }) });
  const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
  const configured = await fetch(base + '/api/pi/settings', { method: 'PUT', headers, body: JSON.stringify({ revision: 0, thinkingLevel: 'medium', executionMode: 'long' }) }); assert.equal(configured.status, 200);
  const project = app.service.createProject('真实超过五分钟时限验证');
  const accepted = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ projectId: project.id, goal: '/hold_long', mode: 'pi', commandId: 'long-wall-clock', continueFromRunId: null }) }); assert.equal(accepted.status, 202);
  const { run: initial } = await accepted.json() as { run: Run }; assert.equal(initial.policy.timeoutMs, 1800000); assert.equal(initial.policy.maxCalls, 2);
  let lastMinute = -1; const deadline = Date.now() + 350000;
  while (Date.now() < deadline) {
    app.scheduler.tick(); const run = app.store.get<Run>('run', initial.id);
    const elapsedMs = run.startedAt ? Date.now() - Date.parse(run.startedAt) : 0;
    const minute = Math.floor(elapsedMs / 60000);
    if (minute !== lastMinute) {
      lastMinute = minute;
      const progress = { runId: run.id, status: run.status, pid: run.workerPid, elapsedMs, calls: run.calls, hostPid: process.pid, base };
      writeFileSync(join(evidence, 'progress.json'), JSON.stringify(progress, null, 2)); console.log(JSON.stringify(progress));
    }
    if (['completed','failed','cancelled','interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) {
      assert.equal(run.status, 'completed', run.error ?? 'long task'); assert(elapsedMs >= 310000); assert.equal(run.timedOutAt, undefined); assert.equal(run.calls, 0);
      writeFileSync(join(evidence, 'report.json'), JSON.stringify({ passed: true, elapsedMs, timeoutMs: run.policy.timeoutMs, maxCalls: run.policy.maxCalls, calls: run.calls, realModelRequests: 0, sessionSaved: Boolean(run.sessionId && run.sessionPath), scope: 'real Pi worker command exceeds prior five-minute boundary; no model or tool-loop quality claim' }, null, 2));
      console.log('long-task QA passed'); break;
    }
    await delay(1000);
  }
  assert.equal(app.store.get<Run>('run', initial.id).status, 'completed', 'long task did not complete within QA observation window');
} finally { await app.close(); }

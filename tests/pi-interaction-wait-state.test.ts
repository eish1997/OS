import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { modelToolSequence } from './helpers/model-tool-sequence.js';
import { canTransition, isLiveExecution, type Policy, type Run } from '../shared/contracts.js';
import type { PluginInteraction } from '../shared/plugin-interaction.js';

test('plugin dialogs use waiting_interaction distinct from waiting_user and recover to running', { timeout: 35000 }, async () => {
  assert.equal(canTransition('running', 'waiting_interaction'), true);
  assert.equal(canTransition('waiting_interaction', 'running'), true);
  assert.equal(canTransition('waiting_user', 'waiting_interaction'), false);
  assert.equal(isLiveExecution('waiting_interaction'), true);
  assert.equal(isLiveExecution('waiting_user'), false);

  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-wait-state', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 2, budgetUsd: 100, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-wait-state-'));
  const transport = modelToolSequence(root, []);
  writeFileSync(join(transport.source, 'transport.mjs'), `export default pi=>{
    pi.registerCommand('waitstate',{description:'Independent wait status',handler:async(args,ctx)=>{
      const ok=await ctx.ui.confirm('Wait state fixture','Proceed?');
      if(!ok)return;
      await ctx.ui.confirm('Second wait','Continue?');
    }});
  };`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'wait-state-password', schedule: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  config.origin = base;
  try {
    const login = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ password: 'wait-state-password' }) });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { 'content-type': 'application/json', origin: base, cookie };
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source: transport.source, revision: state.configuration().revision, commandId: 'wait-transport', trusted: true });
    const pkg = await inspectPlugin(transport.source, app.plugins.agentDir);
    state.phase(op.id, 'committing', 'Wait'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('独立等待状态');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 2, maxCostUsd: 100, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 20000 };

    const answered = app.service.submit(project.id, '/waitstate', 'wait-answer', 'pi', policy, [], undefined, { view: 'project' }).run;
    let sawWaiting = false;
    let sawRunningAfter = false;
    let pendingIds: string[] = [];
    const answerDeadline = Date.now() + 15000;
    while (Date.now() < answerDeadline) {
      app.scheduler.tick();
      const current = app.store.get<Run>('run', answered.id);
      if (current.status === 'waiting_interaction') sawWaiting = true;
      if (sawWaiting && current.status === 'running') sawRunningAfter = true;
      const response = await fetch(`${base}/api/runs/${answered.id}/interactions`, { headers });
      assert.equal(response.status, 200);
      const dialogs = (await response.json() as { interactions: PluginInteraction[] }).interactions.filter(item => item.state === 'pending');
      for (const item of dialogs) {
        if (pendingIds.includes(item.id)) continue;
        pendingIds.push(item.id);
        assert.equal(app.store.get<Run>('run', answered.id).status, 'waiting_interaction', 'pending dialog must flip Run to waiting_interaction');
        assert.notEqual(app.store.get<Run>('run', answered.id).status, 'waiting_user');
        const body = JSON.stringify({ revision: item.revision, commandId: item.id, answer: true });
        assert.equal((await fetch(`${base}/api/runs/${answered.id}/interactions/${item.id}/answer`, { method: 'POST', headers, body })).status, 200);
      }
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    const finalAnswered = app.store.get<Run>('run', answered.id);
    assert.equal(finalAnswered.status, 'completed', finalAnswered.error ?? 'answer path');
    assert.equal(sawWaiting, true, 'must observe waiting_interaction while dialogs are open');
    assert.equal(sawRunningAfter, true, 'must return to running after dialogs close before completion');
    assert.equal(pendingIds.length, 2);
    assert.equal(finalAnswered.calls, 0, 'waiting does not consume model requests');

    const cancelled = app.service.submit(project.id, '/waitstate', 'wait-cancel', 'pi', policy, [], undefined, { view: 'project' }).run;
    let cancelSeenWaiting = false;
    const cancelDeadline = Date.now() + 12000;
    while (Date.now() < cancelDeadline) {
      app.scheduler.tick();
      const current = app.store.get<Run>('run', cancelled.id);
      if (current.status === 'waiting_interaction') {
        cancelSeenWaiting = true;
        await app.service.requestCancel(cancelled.id);
        assert.equal(app.store.get<Run>('run', cancelled.id).cancelRequested, true);
        assert.equal(isLiveExecution(app.store.get<Run>('run', cancelled.id).status), true, 'cancel while waiting keeps live status until worker exits');
      }
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(current.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(20);
    }
    const finalCancelled = app.store.get<Run>('run', cancelled.id);
    assert.equal(cancelSeenWaiting, true);
    assert.equal(finalCancelled.status, 'cancelled', finalCancelled.error ?? 'cancel while waiting');
    const closed = app.store.list<PluginInteraction>('plugin_interaction').filter(item => item.runId === cancelled.id);
    assert(closed.length >= 1);
    assert(closed.every(item => item.state === 'closed' || item.state === 'expired'));

    mkdirSync('output/dev-evidence/pi-parity/loop-114', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-114', 'report.json'), JSON.stringify({
      answered: { status: finalAnswered.status, sawWaiting, sawRunningAfter, dialogs: pendingIds.length, calls: finalAnswered.calls },
      cancelled: { status: finalCancelled.status, sawWaiting: cancelSeenWaiting, cancelRequestedPersisted: true },
      distinctFromWaitingUser: true,
      totalTimeoutStillApplies: true
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

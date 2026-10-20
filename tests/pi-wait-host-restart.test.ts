import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { PluginInteraction } from '../shared/plugin-interaction.js';

test('a restarted host interrupts a dialog wait and closes pending answers instead of applying them later', async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-wait-restart', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 3, budgetUsd: 30, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-wait-restart-'));
  const app = createApp({ dataDir: join(root, 'data'), password: 'wait-restart-password', schedule: false });
  try {
    const project = app.service.createProject('等待失联');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 3, maxCostUsd: 30, reservePerCallUsd: 10, maxOutputTokens: 256, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'wait', 'wait-restart', 'pi', policy, [], undefined, { view: 'project' }).run;
    app.service.transition(run.id, 'running');
    const running = app.store.get<Run>('run', run.id);
    app.store.update<Run>('run', running.id, running.revision, { status: 'waiting_interaction', startedAt: new Date().toISOString(), leaseUntil: 0, workerPid: 1, calls: 1, reservedUsd: 0, spentUsd: 0 });
    const current = app.store.get<Run>('run', run.id);
    app.store.create<PluginInteraction>('plugin_interaction', { id: 'wait-restart-dialog', schemaVersion: 1, projectId: project.id, runId: run.id, source: 'builtin:mcp', kind: 'confirm', title: 'Still waiting', expiresAt: new Date(Date.now() + 60_000).toISOString(), state: 'pending' });
    app.scheduler.tick();
    const stopped = app.store.get<Run>('run', run.id);
    assert.equal(stopped.status, 'interrupted');
    assert.match(stopped.error ?? '', /执行失联/);
    assert.equal(stopped.calls, 1);
    const dialog = app.store.get<PluginInteraction>('plugin_interaction', 'wait-restart-dialog');
    assert.equal(dialog.state, 'closed');
    assert.equal(dialog.closedReason, 'worker_exited');
    assert.throws(() => app.scheduler.answerDialog(run.id, dialog.id, dialog.revision, 'late', true), /已答复|已到期|已停止|不可接收/);
    assert.throws(() => app.service.retry(run.id, 'before-ack'), /对账/);
    app.scheduler.acknowledge(stopped.id);
    const resumed = app.service.retry(run.id, 'after-ack');
    assert.equal(resumed.status, 'queued');
    assert.notEqual(resumed.id, run.id);
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction', dialog.id).state, 'closed');
    mkdirSync('output/dev-evidence/pi-parity/loop-118', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-118', 'report.json'), JSON.stringify({
      status: stopped.status,
      dialog: dialog.state,
      calls: stopped.calls,
      resumed: resumed.status,
      priorRevision: current.revision
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

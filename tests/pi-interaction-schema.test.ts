import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { answerInteraction, interactionView } from '../server/plugin-interaction.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { PluginInteraction } from '../shared/plugin-interaction.js';

test('plugin interaction records of an unknown schema stay closed and are not rewritten as version 1', async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-schema', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 2, budgetUsd: 20, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-interaction-schema-'));
  const app = createApp({ dataDir: join(root, 'data'), password: 'schema-password', schedule: false });
  try {
    const project = app.service.createProject('交互版本');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 2, maxCostUsd: 20, reservePerCallUsd: 10, maxOutputTokens: 256, timeoutMs: 30000 };
    const run = app.service.submit(project.id, 'schema', 'schema', 'pi', policy, [], undefined, { view: 'project' }).run;
    app.service.transition(run.id, 'running');
    const live = app.store.get<Run>('run', run.id);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const base = { projectId: project.id, runId: run.id, source: 'fixture', kind: 'confirm' as const, title: 'Legacy', message: 'keep', expiresAt, state: 'pending' as const };
    const seeded = app.store.create<PluginInteraction>('plugin_interaction', { id: 'missing-schema', schemaVersion: 1, ...base });
    app.store.db.prepare(`UPDATE entities SET body=json_remove(body,'$.schemaVersion') WHERE kind='plugin_interaction' AND id=?`).run(seeded.id);
    const missing = app.store.get<PluginInteraction>('plugin_interaction', seeded.id);
    const future = app.store.create<PluginInteraction>('plugin_interaction', { id: 'future-schema', schemaVersion: 2 as 1, ...base, title: 'Future' });
    const current = app.store.create<PluginInteraction>('plugin_interaction', { id: 'current-schema', schemaVersion: 1, ...base, title: 'Current' });
    assert.equal(interactionView(app.store, missing).state, 'closed');
    assert.match(interactionView(app.store, missing).closedReason ?? '', /版本不受支持/);
    assert.equal(interactionView(app.store, future).state, 'closed');
    assert.equal(interactionView(app.store, current).state, 'pending');
    assert.equal(missing.schemaVersion, undefined);
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction', future.id).schemaVersion, 2);
    assert.throws(() => answerInteraction(app.store, run.id, missing.id, missing.revision, 'late', true), /已答复|已到期|已停止/);
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction', missing.id).state, 'pending');
    assert.equal(app.store.get<Run>('run', run.id).calls, live.calls);
    mkdirSync('output/dev-evidence/pi-parity/loop-120', { recursive: true });
    writeFileSync(join('output/dev-evidence/pi-parity/loop-120', 'report.json'), JSON.stringify({
      missingClosed: true,
      futureClosed: true,
      currentPending: true,
      storedMissingSchema: app.store.get<PluginInteraction>('plugin_interaction', missing.id).schemaVersion ?? null,
      calls: app.store.get<Run>('run', run.id).calls
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

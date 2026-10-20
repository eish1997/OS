import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { compactionMemoryGuard } from '../server/pi-compaction-guard.js';
import type { Policy, Run } from '../shared/contracts.js';

test('production summarization requests include the host memory guard', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-guard', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 40, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-compaction-guard-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const bodies = join(root, 'bodies.jsonl');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-guard', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import { appendFileSync } from 'node:fs';
    export default pi => pi.on('session_start', () => {
      globalThis.fetch = async (_url, options) => {
        appendFileSync(${JSON.stringify(bodies)}, JSON.stringify(options?.body ?? '') + '\\n');
        const text = 'Preserve MARKER without restating deleted memories.';
        const item = { id: 'msg-guard', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
        const events = [
          { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
          { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
          { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.completed', response: { id: 'response-guard', status: 'completed', output: [item], usage: { input_tokens: 200, output_tokens: 20, total_tokens: 220, input_tokens_details: { cached_tokens: 0 } } } }
        ];
        return new Response(events.map(event => 'event: ' + event.type + '\\ndata: ' + JSON.stringify(event) + '\\n\\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'guard-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'guard-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Guard transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('摘要守卫');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 20000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', autoCompaction: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const pi = await loadPi(); const manager = pi.SessionManager.create(cwd, sessions);
    for (let i = 0; i < 6; i++) manager.appendMessage({ role: 'user', content: `MARKER step ${i} ` + 'history '.repeat(8000), timestamp: Date.now() });
    const seeded = app.service.submit(project.id, 'seed', 'seed', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(seeded.id, 'running');
    const current = app.store.get<Run>('run', seeded.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(seeded.id, 'completed');
    const compact = app.service.submit(project.id, 'manual compaction', 'guard-compact', 'pi', policy, [], undefined, { view: 'project' }, seeded.id, undefined, 'compact', 'KEEP_FOCUS_MARKER and file paths').run;
    assert.equal(compact.compactionFocus, 'KEEP_FOCUS_MARKER and file paths');
    const deadline = Date.now() + 20000;
    let done = compact;
    while (Date.now() < deadline) {
      app.scheduler.tick();
      done = app.store.get<Run>('run', compact.id);
      if (['completed', 'failed', 'cancelled', 'interrupted'].includes(done.status) && !app.scheduler.pluginMaintenanceBlocked()) break;
      await delay(40);
    }
    assert.equal(done.status, 'completed', done.error ?? 'guard compact');
    const recorded = readFileSync(bodies, 'utf8');
    assert(recorded.includes(compactionMemoryGuard));
    assert(recorded.includes('Additional focus:'));
    assert(recorded.includes('KEEP_FOCUS_MARKER'));
    mkdirSync('output/dev-evidence/pi-parity/loop-108', { recursive: true });
    writeFileSync('output/dev-evidence/pi-parity/loop-108/report.json', JSON.stringify({ guarded: true, focus: true, calls: done.calls }, null, 2));
    mkdirSync('output/dev-evidence/pi-parity/compaction-guard', { recursive: true });
    writeFileSync('output/dev-evidence/pi-parity/compaction-guard/report.json', JSON.stringify({ guarded: true, calls: done.calls }, null, 2));
  } finally { await app.close(); Object.assign(config, before); }
});

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
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';
import { backup, restore } from '../server/backup.js';
import { Store } from '../server/store.js';
import { continuationFor } from '../server/native-session.js';

test('32 MiB manual compaction crosses HTTP and production workers, preserves source and restores its checkpoint', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-compaction-key', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 10, budgetUsd: 100, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-compaction-worker-')); const source = join(root, 'transport'); mkdirSync(source);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-transport', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import {existsSync,writeFileSync} from 'node:fs';
  export default pi => pi.on('session_start', () => {
    globalThis.fetch = async () => {
      const marker=${JSON.stringify(join(root,'transient-sent'))};
      if(!existsSync(marker)){writeFileSync(marker,'sent');return Response.json({error:{message:'503 controlled summary failure',type:'server_error'}},{status:503});}
      const text='Preserve MARKER and continue the original objective. Files and decisions retained.';
      const item={id:'msg-fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
      const events=[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},
        {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
        {type:'response.output_text.delta',output_index:0,content_index:0,delta:text},
        {type:'response.output_item.done',output_index:0,item},
        {type:'response.completed',response:{id:'response-fixture',status:'completed',output:[item],usage:{input_tokens:200,output_tokens:20,total_tokens:220,input_tokens_details:{cached_tokens:0}}}}];
      return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
    };
  });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'compaction-test-password', schedule: false, storageLimits: { sessionsBytes: 512 * 1024 * 1024 } });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'transport-install', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir); state.phase(op.id, 'committing', 'Local test transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('磁盘压缩验收');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 4, maxCostUsd: 40, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 15000, piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', autoCompaction: true } };
    const cwd = join(root, 'data', 'workspaces', project.id); const sessions = join(root, 'data', 'sessions', project.id); mkdirSync(cwd, { recursive: true }); mkdirSync(sessions, { recursive: true });
    const pi = await loadPi(); const manager = pi.SessionManager.create(cwd, sessions);
    manager.appendMessage({ role: 'user', content: 'Earlier archived material ' + 'x'.repeat(32 * 1024 * 1024), timestamp: Date.now() });
    for (let i = 0; i < 8; i++) {
      manager.appendMessage({ role: 'user', content: `Step ${i} MARKER ` + 'history '.repeat(4000), timestamp: Date.now() });
      manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'MARKER progress ' + i }], api: 'openai-responses', provider: 'openai', model: 'gpt-5.6-sol', usage: { input: 60000, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 60010, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
    }
    const kept = manager.getEntries().filter(e => e.type === 'message' && e.message.role === 'user').at(-4)!;
    manager.appendCompaction('Preserve MARKER and the original objective; earlier material is summarized.', kept.id, 9_000_000);
    const original = app.service.submit(project.id, 'original fixture', 'original', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(original.id, 'running');
    const current = app.store.get<Run>('run', original.id);
    app.store.update<Run>('run', current.id, current.revision, { sessionPath: manager.getSessionFile(), sessionId: manager.getSessionId(), pluginManifest: state.manifest() });
    app.service.transition(original.id, 'completed');
    const bytes = readFileSync(manager.getSessionFile()!);
    assert(bytes.length > 32 * 1024 * 1024);
    const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'compaction-test-password' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const input = { projectId: project.id, goal: 'manual compaction', commandId: 'compact', mode: 'pi', continueFromRunId: original.id, sessionAction: 'compact' };
    const post = (data: unknown) => fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify(data) });
    assert.equal((await post({ ...input, continueFromRunId: null })).status, 400);
    const accepted = await post(input); assert.equal(accepted.status, 202);
    const submitted = await accepted.json() as { run: Run };
    assert.equal((await (await post(input)).json()).run.id, submitted.run.id);
    assert.equal((await post({ ...input, commandId: 'compact-running', continueFromRunId: submitted.run.id })).status, 409);
    assert.equal(submitted.run.sessionAction, 'compact');
    const waitRun = async (id: string) => {
      const deadline = Date.now() + 18000;
      while (Date.now() < deadline) {
        app.scheduler.tick(); const run = app.store.get<Run>('run', id);
        if (['completed','failed','cancelled','interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) return run;
        await delay(50);
      }
      throw new Error('worker did not finish');
    };
    const compacted = await waitRun(submitted.run.id);
    assert.equal(compacted.status, 'completed', compacted.error ?? 'compaction worker');
    assert.equal(compacted.compaction?.phase, 'completed'); assert.equal(compacted.compaction?.reason, 'manual');
    assert.equal(compacted.calls, 2); assert.equal(compacted.usage?.complete, false);
    assert.equal(compacted.retryState?.source, 'compaction'); assert.equal(compacted.retryState?.phase, 'succeeded');
    assert.equal(compacted.retryState?.attempt, 1);
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === compacted.id);
    assert.equal(receipts.length, compacted.calls); assert(receipts.every(r => r.purpose === 'compaction'));
    assert.deepEqual(receipts.map(r=>r.state), ['unknown','settled']);
    assert.deepEqual(readFileSync(manager.getSessionFile()!), bytes);
    assert.notEqual(compacted.sessionPath, manager.getSessionFile());
    const reopened = pi.SessionManager.open(compacted.sessionPath!, sessions, cwd);
    assert(reopened.getEntries().some(e => e.type === 'compaction' && e.summary.includes('MARKER')));
    const frozenCheckpoint = readFileSync(compacted.sessionPath!);
    const continued = app.service.submit(project.id, 'Continue MARKER', 'continue', 'pi', policy, [], undefined, { view: 'project' }, compacted.id);
    const done = await waitRun(continued.run.id); assert.equal(done.status, 'completed', done.error ?? 'continuation worker');
    assert.deepEqual(readFileSync(compacted.sessionPath!), frozenCheckpoint);
    assert(readFileSync(done.sessionPath!, 'utf8').includes('Continue MARKER'));
    assert(pi.SessionManager.open(done.sessionPath!, sessions, cwd).getEntries().some(e => e.type === 'compaction'));
    const archive = join(root, 'archive'); const restoredRoot = join(root, 'restored');
    await app.scheduler.stop();
    backup(app.store, join(root, 'data'), archive); restore(archive, restoredRoot);
    const restored = new Store(join(restoredRoot, 'workbench.sqlite'));
    try {
      const restoredRun = restored.get<Run>('run', compacted.id);
      assert(continuationFor(restored, project.id, restoredRun.policy, restoredRun.id));
      assert.deepEqual(readFileSync(restoredRun.sessionPath!), frozenCheckpoint);
      assert.equal(restoredRun.sessionAction, 'compact');
      assert.equal(restored.list<ModelRequestReceipt>('model_request').filter(r => r.runId === compacted.id).length, receipts.length);
    } finally { restored.close(); }
  } finally { await app.close(); Object.assign(config, before); }
});

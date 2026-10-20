import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

// Multi-phase wall clocks (idle + continue + cancel + 8s total + resume) need headroom beyond a single worker.
test('production worker idle failure preserves history and unknown receipt; a new worker continues it', { timeout: 60000 }, async () => {
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-idle-key', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 8, budgetUsd: 100, reservePerCallUsd: 10 });
  const root = mkdtempSync(join(tmpdir(), 'pi-idle-worker-'));
  const source = join(root, 'transport'); mkdirSync(source);
  const stalled = join(root, 'stall'); writeFileSync(stalled, 'controlled network stall');
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'offline-idle-transport', pi: { extensions: ['transport.mjs'] } }));
  writeFileSync(join(source, 'transport.mjs'), `import {existsSync} from 'node:fs';
    export default pi => pi.on('session_start', () => {
      globalThis.fetch = async (_url, options) => {
        if (existsSync(${JSON.stringify(stalled)})) return await new Promise((_resolve, reject) => {
          const abort = () => reject(new DOMException('Aborted', 'AbortError'));
          if (options?.signal?.aborted) abort(); else options?.signal?.addEventListener('abort', abort, {once:true});
        });
        const text='RECOVERED MARKER';
        const item={id:'msg-idle',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};
        const events=[{type:'response.output_item.added',output_index:0,item:{...item,content:[]}},
          {type:'response.content_part.added',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
          {type:'response.output_text.delta',output_index:0,content_index:0,delta:text},
          {type:'response.output_item.done',output_index:0,item},
          {type:'response.completed',response:{id:'response-idle',status:'completed',output:[item],usage:{input_tokens:200,output_tokens:20,total_tokens:220,input_tokens_details:{cached_tokens:0}}}}];
        return new Response(events.map(e=>'event: '+e.type+'\\ndata: '+JSON.stringify(e)+'\\n\\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
      };
    });`);
  const app = createApp({ dataDir: join(root, 'data'), password: 'idle-test-password', schedule: false });
  try {
    const state = app.plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'idle-transport', trusted: true });
    const pkg = await inspectPlugin(source, app.plugins.agentDir);
    state.phase(op.id, 'committing', 'Controlled local transport'); state.commit(op.id, [pkg]); state.configure(state.configuration().revision, pkg.id, true);
    const project = app.service.createProject('超时接续验证');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, modelBinding: app.modelAccess.settings().binding, maxCalls: 1, maxCostUsd: 10, reservePerCallUsd: 10, maxOutputTokens: 1024, timeoutMs: 15000,
      piRuntime: { schemaVersion: 1, configurationRevision: 0, requestedThinkingLevel: 'medium', thinkingLevel: 'medium', networkIdleTimeoutMs: 200 } };
    const waitRun = async (id: string, ms = 45000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        app.scheduler.tick(); const run = app.store.get<Run>('run', id);
        if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) && !app.scheduler.pluginMaintenanceBlocked()) return run;
        await delay(30);
      }
      throw new Error('worker did not finish');
    };
    const submitted = app.service.submit(project.id, 'Preserve objective MARKER', 'idle-first', 'pi', policy);
    const failed = await waitRun(submitted.run.id);
    assert.equal(failed.status, 'failed'); assert.match(failed.error ?? '', /模型连续无响应/);
    assert.equal(failed.timedOutAt, undefined, 'idle failure is separate from total runtime expiry');
    assert.equal(failed.calls, 1);
    const receipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === failed.id);
    assert.equal(receipts.length, 1); assert.equal(receipts[0].state, 'unknown'); assert.equal(receipts[0].costUsd, undefined);
    assert(failed.sessionPath); const bytes = readFileSync(failed.sessionPath);
    assert(bytes.toString('utf8').includes('Preserve objective MARKER'));
    unlinkSync(stalled);
    assert.equal(app.service.taskBudget(failed.id).remainingCalls, 0);
    const submittedNext = app.service.retry(failed.id, 'idle-continue', { calls: 1, costUsd: 10, reason: '恢复无响应后耗尽额度的原任务' });
    const recovered = await waitRun(submittedNext.id);
    assert.equal(recovered.status, 'completed', recovered.error ?? 'continuation worker');
    assert.equal(recovered.calls, 1); assert(recovered.usage?.complete);
    assert.equal(recovered.taskId, failed.taskId); assert.equal(app.service.taskBudget(failed.id).usedCalls, 2);
    assert.equal(app.store.get<Run>('run', failed.id).policy.maxCalls, 1);
    assert.notEqual(recovered.sessionPath, failed.sessionPath);
    assert.deepEqual(readFileSync(failed.sessionPath), bytes);
    assert(readFileSync(recovered.sessionPath!, 'utf8').includes('RECOVERED MARKER'));
    assert.equal(app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === failed.id).length, 1);
    // A user stop must not be mislabeled as network idleness or consume a second request.
    writeFileSync(stalled, 'controlled network stall');
    const cancellablePolicy: Policy = { ...policy, piRuntime: { ...policy.piRuntime!, networkIdleTimeoutMs: 10000 } };
    const cancellable = app.service.submit(project.id, 'Wait for user cancellation', 'idle-cancel', 'pi', cancellablePolicy, [], undefined, { view: 'project' }, recovered.id).run;
    const cancelDeadline = Date.now() + 8000;
    while (app.store.get<Run>('run', cancellable.id).calls === 0 && Date.now() < cancelDeadline) {
      app.scheduler.tick(); await delay(20);
    }
    assert.equal(app.store.get<Run>('run', cancellable.id).calls, 1);
    await app.service.requestCancel(cancellable.id);
    const cancelled = await waitRun(cancellable.id);
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.error, undefined);
    assert.equal(cancelled.timedOutAt, undefined); assert.equal(cancelled.calls, 1);
    const cancelledReceipts = app.store.list<ModelRequestReceipt>('model_request').filter(r => r.runId === cancelled.id);
    assert.equal(cancelledReceipts.length, 1); assert.equal(cancelledReceipts[0].state, 'unknown');
    // Real wall time, not backdated timestamps; test total and network deadlines separately.
    // 20s leaves room for continuation worker startup under serial-suite load; network idle stays higher so total still wins while stalled.
    const timedPolicy: Policy = { ...cancellablePolicy, timeoutMs: 20000, piRuntime: { ...cancellablePolicy.piRuntime!, networkIdleTimeoutMs: 60000 } };
    const timed = app.service.submit(project.id, 'Preserve TOTAL_DEADLINE_MARKER', 'total-timeout', 'pi', timedPolicy, [], undefined, {view:'project'}, cancelled.id).run;
    const expired = await waitRun(timed.id);
    assert.equal(expired.status, 'failed'); assert(expired.timedOutAt);
    assert.match(expired.error ?? '', /超过运行时间/);
    assert(Date.parse(expired.timedOutAt) - Date.parse(expired.startedAt!) >= timedPolicy.timeoutMs);
    assert.equal(expired.calls, 1); assert(expired.sessionPath);
    const checkpoint = readFileSync(expired.sessionPath);
    assert(checkpoint.toString('utf8').includes('TOTAL_DEADLINE_MARKER'));
    const expiredReceipts = app.store.list<ModelRequestReceipt>('model_request').filter(r=>r.runId===expired.id);
    assert.equal(expiredReceipts.length,1);assert.equal(expiredReceipts[0].state,'unknown');
    unlinkSync(stalled);
    const renewed = app.service.retry(expired.id, 'total-timeout-resume', {calls:1,costUsd:10,reason:'从总时限检查点继续'});
    const finished = await waitRun(renewed.id);
    assert.equal(finished.status,'completed',finished.error ?? 'deadline recovery');
    assert.equal(finished.taskId, expired.taskId); assert.equal(finished.policy.timeoutMs,timedPolicy.timeoutMs);
    assert.equal(finished.timedOutAt,undefined);assert.equal(app.service.taskBudget(finished.id).usedCalls,2);
    assert.deepEqual(readFileSync(expired.sessionPath),checkpoint);
  } finally { await app.close(); Object.assign(config, before); }
});

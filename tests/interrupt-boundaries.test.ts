import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { config } from '../server/config.js';
import { loadPi } from '../server/pi-adapter.js';
import { answerInteraction, createInteraction } from '../server/plugin-interaction.js';
import { persistTextChunk } from '../server/run-stream.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { PluginInteraction } from '../shared/plugin-interaction.js';

/**
 * Finite interrupt matrix for plan §5 / PIV-15 (B2).
 * Cells map to existing suites; this file only fills thin HTTP/first-write gaps
 * and records the matrix. Do not add adjacent time windows here.
 */
test('interrupt matrix: stream, interaction, budget, and branch stay reconciliable across three boundaries', { timeout: 60000 }, async () => {
  const evidence = 'output/dev-evidence/pi-parity/loop-154';
  mkdirSync(evidence, { recursive: true });
  const root = mkdtempSync(join(tmpdir(), 'interrupt-matrix-'));
  const before = { ...config };
  Object.assign(config, { apiKey: 'offline-interrupt', provider: 'openai', model: 'gpt-5.6-sol', maxCalls: 4, budgetUsd: 4, reservePerCallUsd: 1 });
  const app = createApp({ dataDir: join(root, 'data'), password: 'interrupt-matrix', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    const project = app.service.createProject('中断对账');
    const binding = app.modelAccess.settings().binding;
    assert.equal(binding.kind, 'api');
    const policy: Policy = { version: 8, projectId: project.id, allowModel: true, toolNames: [], maxCalls: 1, maxCostUsd: 1, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 10000, modelBinding: binding };
    const run = app.service.submit(project.id, 'matrix', 'matrix-first', 'pi', policy, [], undefined, { view: 'project' }).run;
    app.service.transition(run.id, 'running', { mcpManifest: { schemaVersion: 1, signature: 'fixture', enabled: true, globalRevision: 0, projectRevision: 0, servers: [], autoEnableCodemode: true, codemode: true, toolSearch: false } });
    assert.equal(app.store.get<Run>('run', run.id).mcpManifest?.enabled, true);

    // Stream — before first durable write
    app.store.db.exec("CREATE TRIGGER reject_first_delta BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='assistant.delta' BEGIN SELECT RAISE(ABORT,'controlled first stream failure'); END");
    assert.throws(() => persistTextChunk(app.store, run.id, { messageId: 's1', chunk: 0, text: 'NEVER', phase: 'partial' }), /controlled first stream failure/);
    assert.equal(app.store.list('run_message').length, 0);
    app.store.db.exec('DROP TRIGGER reject_first_delta');

    // Stream — mid transaction after a prior committed chunk
    persistTextChunk(app.store, run.id, { messageId: 's1', chunk: 0, text: 'KEEP', phase: 'partial' });
    app.store.db.exec("CREATE TRIGGER reject_second_delta BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='assistant.delta' AND json_extract(NEW.body,'$.data.chunk')=1 BEGIN SELECT RAISE(ABORT,'controlled second stream failure'); END");
    assert.throws(() => persistTextChunk(app.store, run.id, { messageId: 's1', chunk: 1, text: 'DROP', phase: 'partial' }), /controlled second stream failure/);
    assert.equal(app.service.conversation(project.id).messages.at(-1)?.text, 'KEEP');
    app.store.db.exec('DROP TRIGGER reject_second_delta');

    // Stream — after commit, lost response / replay
    persistTextChunk(app.store, run.id, { messageId: 's1', chunk: 0, text: 'KEEP', phase: 'partial' });
    persistTextChunk(app.store, run.id, { messageId: 's1', chunk: 1, text: ' TAIL', phase: 'final' });
    assert.equal(app.service.conversation(project.id).messages.filter(m => m.role === 'assistant' && m.text.includes('KEEP TAIL')).length, 1);

    // Interaction — before write / mid transaction
    const dialog = createInteraction(app.store, run.id, { id: 'ask', source: 'builtin:mcp', kind: 'input', title: 'Secret', timeoutMs: 60000 });
    app.store.db.exec("CREATE TRIGGER reject_answer BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='run.interaction_answered' BEGIN SELECT RAISE(ABORT,'controlled answer failure'); END");
    assert.throws(() => answerInteraction(app.store, run.id, dialog.id, 1, 'answer-1', 'secret-value'), /controlled answer failure/);
    assert.equal(app.store.get<PluginInteraction>('plugin_interaction', dialog.id).state, 'pending');
    app.store.db.exec('DROP TRIGGER reject_answer');

    // Interaction — after commit, client retries same commandId
    const answered = answerInteraction(app.store, run.id, dialog.id, 1, 'answer-1', 'secret-value');
    assert.equal(answered.fresh, true);
    const replayed = answerInteraction(app.store, run.id, dialog.id, 1, 'answer-1', 'other-value');
    assert.equal(replayed.fresh, false);
    assert.equal(replayed.answer, undefined);
    assert.throws(() => answerInteraction(app.store, run.id, dialog.id, 1, 'answer-2', 'second'), /已答复/);

    app.service.transition(run.id, 'failed');

    // Budget — mid transaction rollback
    app.store.db.exec("CREATE TRIGGER reject_grant BEFORE INSERT ON entities WHEN NEW.kind='task_budget_grant' BEGIN SELECT RAISE(ABORT,'controlled grant failure'); END");
    assert.throws(() => app.service.retry(run.id, 'budget-fail', { calls: 1, costUsd: 1, reason: '继续' }), /controlled grant failure/);
    assert.equal(app.store.list('task_budget_grant').length, 0);
    assert.equal(app.store.list<Run>('run').length, 1);
    app.store.db.exec('DROP TRIGGER reject_grant');

    // Budget — after commit HTTP replay (lost response)
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'interrupt-matrix' }) });
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'Content-Type': 'application/json' };
    const budgetBody = { commandId: 'budget-ok', calls: 1, costUsd: 1, reason: '继续' };
    const firstBudget = await fetch(base + `/api/runs/${run.id}/extend-retry`, { method: 'POST', headers, body: JSON.stringify(budgetBody) });
    assert.equal(firstBudget.status, 200);
    const resumed = await firstBudget.json() as Run;
    const budgetReplay = await fetch(base + `/api/runs/${run.id}/extend-retry`, { method: 'POST', headers, body: JSON.stringify(budgetBody) });
    assert.equal(budgetReplay.status, 200);
    assert.equal((await budgetReplay.json() as Run).id, resumed.id);
    assert.equal(app.store.list('task_budget_grant').length, 1);

    // Branch — use a completed source with binding matching native-session fixture rules
    const completed = app.service.submit(project.id, 'branch-source', 'branch-source', 'pi', policy, [], undefined, { view: 'project' }, null).run;
    app.service.transition(completed.id, 'running');
    const cwd = join(root, 'data', 'workspaces', project.id);
    const sessionDir = join(root, 'data', 'sessions', project.id);
    mkdirSync(cwd, { recursive: true });
    mkdirSync(sessionDir, { recursive: true });
    const pi = await loadPi();
    const manager = pi.SessionManager.create(cwd, sessionDir);
    manager.appendMessage({ role: 'user', content: 'Branch leaf', timestamp: Date.now() });
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'ok' }], api: 'openai-responses', provider: 'openai', model: binding.model, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() });
    const live = app.store.get<Run>('run', completed.id);
    app.store.update<Run>('run', completed.id, live.revision, { sessionId: manager.getSessionId(), sessionPath: manager.getSessionFile() });
    app.store.create('session_binding', { id: `session:${completed.id}`, projectId: project.id, ...({ runId: completed.id, taskId: completed.taskId, policyVersion: policy.version, model: binding.model, authKind: binding.kind, sessionId: manager.getSessionId(), sessionPath: manager.getSessionFile(), piVersion: '1.0.3', cwd } as object) });
    app.service.transition(completed.id, 'completed');
    const entry = manager.getEntries().find(item => item.type === 'message' && item.message.role === 'user')!;
    const sourceHash = createHash('sha256').update(readFileSync(manager.getSessionFile()!)).digest('hex');

    // Branch — mid transaction rollback (same pattern as native-session branch test)
    const beforeBranch = { runs: app.store.list<Run>('run').length, conversations: app.store.list('conversation').length };
    app.store.db.exec("CREATE TRIGGER reject_branch_run BEFORE INSERT ON entities WHEN NEW.kind='run' BEGIN SELECT RAISE(ABORT,'controlled branch failure'); END");
    assert.throws(() => app.service.branchConversation(project.id, completed.id, entry.id, sourceHash, 'Matrix branch', 'Branch goal', 'branch-fail', policy), /controlled branch failure/);
    assert.equal(app.store.list<Run>('run').length, beforeBranch.runs);
    assert.equal(app.store.list('conversation').length, beforeBranch.conversations);
    app.store.db.exec('DROP TRIGGER reject_branch_run');

    // Branch — after commit, lost response / same commandId replay (HTTP covered by pi-image-worker)
    const branched = app.service.branchConversation(project.id, completed.id, entry.id, sourceHash, 'Matrix branch', 'Branch goal', 'branch-ok', policy);
    assert.deepEqual(app.service.branchConversation(project.id, completed.id, entry.id, sourceHash, 'Matrix branch', 'Branch goal', 'branch-ok', policy), JSON.parse(JSON.stringify(branched)));
    assert.equal(app.store.list<Run>('run').filter(item => item.continuation?.entryId === entry.id).length, 1);

    writeFileSync(join(evidence, 'report.json'), JSON.stringify({
      closed: '流式消息、交互答复、追加预算、分支创建各自具备写入前失败、事务回滚、提交后重放三格证据，不重复副作用',
      matrix: {
        stream: { beforeWrite: 'interrupt-boundaries + run-stream', midTransaction: 'interrupt-boundaries + run-stream', afterCommitReplay: 'interrupt-boundaries + run-stream / runtime-ui reconnect' },
        interaction: { beforeWrite: 'interrupt-boundaries + plugin-interaction', midTransaction: 'interrupt-boundaries + plugin-interaction', afterCommitReplay: 'interrupt-boundaries + plugin-interaction' },
        budget: { beforeWrite: 'task-budget-addition invalid', midTransaction: 'interrupt-boundaries + task-budget-addition rollback', afterCommitReplay: 'interrupt-boundaries + task-budget-addition HTTP' },
        branch: { beforeWrite: 'native-session reject before run', midTransaction: 'interrupt-boundaries + native-session', afterCommitReplay: 'interrupt-boundaries + pi-image-worker HTTP' },
      },
      realModels: 0,
      delivery: false,
    }, null, 2));
  } finally {
    await app.close();
    Object.assign(config, before);
  }
});

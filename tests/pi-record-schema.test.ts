import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { acceptRunInput, inputView, updateRunInput } from '../server/run-input.js';
import { persistTextChunk } from '../server/run-stream.js';
import { persistToolProgress, reconcileTool, requireToolReconciliation, toolExecutions } from '../server/tool-progress.js';
import { AppError, Store } from '../server/store.js';
import type { Policy } from '../shared/contracts.js';

function rewriteVersion(store: Store, id: string, schemaVersion?: number) {
  const body = JSON.parse(String(store.db.prepare('SELECT body FROM entities WHERE id=?').get(id)!.body));
  if (schemaVersion === undefined) delete body.schemaVersion; else body.schemaVersion = schemaVersion;
  store.db.prepare('UPDATE entities SET body=? WHERE id=?').run(JSON.stringify(body), id);
  return body;
}

test('unknown guidance, reply and tool records stay unchanged', async () => {
  const app = createApp({ dataDir: mkdtempSync(join(tmpdir(), 'record-schema-')), password: 'record-schema', schedule: false });
  try {
    const project = app.service.createProject('版本');
    const conversation = app.service.createConversation(project.id, '话题', 'topic');
    const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: false, maxCalls: 0, maxCostUsd: 0, reservePerCallUsd: 0, maxOutputTokens: 100, timeoutMs: 10000 };
    const run = app.service.submit(project.id, 'goal', 'run', 'pi', policy, [], undefined, { view: 'project' }, null, conversation.id).run;
    app.service.transition(run.id, 'running');
    const input = acceptRunInput(app.store, run.id, conversation.id, 'guide', 'KEEP').input;
    rewriteVersion(app.store, input.id);
    const viewed = inputView(app.store, app.store.get<typeof input>('run_input', input.id));
    assert.equal(viewed.state, 'unknown');
    assert.match(viewed.reason ?? '', /版本不受支持/);
    assert.throws(() => updateRunInput(app.store, run.id, input.id, 'queued'), (error: unknown) => error instanceof AppError && error.status === 409);
    assert.equal(app.store.get<typeof input>('run_input', input.id).state, 'accepted');

    persistTextChunk(app.store, run.id, { messageId: 'stable', chunk: 0, text: 'CURRENT', phase: 'partial' });
    rewriteVersion(app.store, `${run.id}:stable`, 2);
    assert.throws(() => persistTextChunk(app.store, run.id, { messageId: 'stable', chunk: 1, text: 'MORE', phase: 'partial' }), (error: unknown) => error instanceof AppError && error.status === 409);
    assert.equal(app.store.get<import('../shared/contracts.js').Entity & { preview: string; schemaVersion?: number }>('run_message', `${run.id}:stable`).preview, 'CURRENT');
    assert.equal(app.store.get<import('../shared/contracts.js').Entity & { schemaVersion?: number }>('run_message', `${run.id}:stable`).schemaVersion, 2);

    persistToolProgress(app.store, run.id, { callId: 'tool-1', name: 'write_asset', source: 'host', sequence: 0, phase: 'running', preview: 'started' });
    const tool = toolExecutions(app.store, run.id).items[0];
    rewriteVersion(app.store, tool.id);
    assert.doesNotThrow(() => requireToolReconciliation(app.store, run.id));
    assert.throws(() => persistToolProgress(app.store, run.id, { callId: 'tool-1', name: 'write_asset', source: 'host', sequence: 1, phase: 'failed', preview: 'ended', resultMessageId: `${run.id}:stable` }), (error: unknown) => error instanceof AppError && error.status === 409);
    assert.throws(() => reconcileTool(app.store, run.id, tool.id, tool.revision, 'not_performed', 'unchanged'), (error: unknown) => error instanceof AppError && error.status === 409);
    const stored = app.store.get<typeof tool>('tool_execution', tool.id);
    assert.equal(stored.phase, 'running');
    assert.equal(stored.reconciliation, undefined);
    assert.equal(stored.schemaVersion, undefined);
  } finally { await app.close(); }
});

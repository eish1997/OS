import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, AppError } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import { persistTextChunk, messageChunks } from '../server/run-stream.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

test('unknown event and request versions are not applied or rewritten', () => {
  const root = mkdtempSync(join(tmpdir(), 'event-schema-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('schema');
  const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, maxCalls: 4, maxCostUsd: 4, reservePerCallUsd: 1, maxOutputTokens: 100, timeoutMs: 60000, modelBinding: { kind: 'api', provider: 'openai', model: 'fixture' } };
  const run = service.submit(project.id, 'schema', 'schema', 'pi', policy, [], undefined, { view: 'project' }, null).run;
  service.transition(run.id, 'running');
  try {
    persistTextChunk(store, run.id, { messageId: 'stable', chunk: 0, text: 'CURRENT', phase: 'partial' });
    store.db.prepare('INSERT INTO events(id, body) VALUES(?, ?)').run('future-chunk', JSON.stringify({ eventId: 'future-chunk', schemaVersion: 2, type: 'assistant.delta', at: new Date().toISOString(), projectId: project.id, runId: run.id, data: { messageId: `${run.id}:stable`, chunk: 1, text: 'FUTURE_CHUNK', phase: 'partial' } }));
    store.db.prepare('INSERT INTO events(id, body) VALUES(?, ?)').run('future-message', JSON.stringify({ eventId: 'future-message', schemaVersion: 2, type: 'assistant.message', at: new Date().toISOString(), projectId: project.id, runId: run.id, data: { messageId: 'missing-future', text: 'FUTURE' } }));
    assert.equal(messageChunks(store, run.id, `${run.id}:stable`).map(chunk => chunk.text).join(''), 'CURRENT');
    const page = service.conversation(project.id);
    assert.equal(page.messages.some(message => message.text.includes('FUTURE')), false);
    assert.equal(page.messages.some(message => message.text.includes('CURRENT')), true);

    service.reserveCall(run.id, undefined, 10);
    const receipt = store.get<ModelRequestReceipt>('model_request', `${run.id}:1`);
    const stored = JSON.parse(String(store.db.prepare('SELECT body FROM entities WHERE id=?').get(receipt.id)!.body));
    delete stored.schemaVersion;
    store.db.prepare('UPDATE entities SET body=? WHERE id=?').run(JSON.stringify(stored), receipt.id);
    const before = store.get<Run>('run', run.id);
    assert.throws(() => service.settleCall(run.id, 0.2, { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, complete: true }, 1), (error: unknown) => error instanceof AppError && error.status === 409);
    assert.equal(JSON.parse(String(store.db.prepare('SELECT body FROM entities WHERE id=?').get(receipt.id)!.body)).schemaVersion, undefined);
    assert.equal(JSON.parse(String(store.db.prepare('SELECT body FROM entities WHERE id=?').get(receipt.id)!.body)).state, 'reserved');
    assert.equal(store.get<Run>('run', run.id).spentUsd, before.spentUsd);
  } finally { store.close(); }
});

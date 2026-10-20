import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Service } from '../server/service.js';
import { Assets } from '../server/assets.js';
import type { Policy, Run } from '../shared/contracts.js';
import type { ModelRequestReceipt } from '../shared/pi-runtime.js';

function fixture(subscription = false) {
  const root = mkdtempSync(join(tmpdir(), 'request-ledger-'));
  const store = new Store(join(root, 'workbench.sqlite'));
  const service = new Service(store, new Assets(store, root));
  const project = service.createProject('ledger');
  const policy: Policy = { version: 8, projectId: project.id, toolNames: [], allowModel: true, maxCalls: 4, maxCostUsd: 4, reservePerCallUsd: subscription ? 0 : 1, maxOutputTokens: 100, timeoutMs: 60000, modelBinding: { kind: subscription ? 'chatgpt' : 'api', provider: 'openai', model: 'fixture', connectionId: subscription ? 'fixture-connection' : undefined } };
  const run = service.submit(project.id, 'ledger', 'ledger', 'pi', policy, [], undefined, { view: 'project' }, null).run;
  service.transition(run.id, 'running');
  return { root, store, service, run };
}
const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, complete: true };

test('reservation replay retains its original number and paginated API usage is complete only with all receipts', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.service.reserveRequest(f.run.id, 'request-a', undefined, 10, 'compaction'), { callNumber: 1 });
    f.service.reserveRequest(f.run.id, 'request-b', undefined, 10);
    assert.deepEqual(f.service.reserveRequest(f.run.id, 'request-a', undefined, 10, 'compaction'), { callNumber: 1 });
    assert.equal(f.store.get<Run>('run', f.run.id).calls, 2);
    assert.throws(() => f.service.reserveRequest(f.run.id, 'request-a', undefined, 10, 'branch_summary'));
    f.service.settleCall(f.run.id, 0.1, usage, 1);
    assert.equal(f.store.get<Run>('run', f.run.id).usage?.complete, false);
    f.service.settleCall(f.run.id, 0.2, usage, 2);
    const run = f.store.get<Run>('run', f.run.id);
    assert.equal(run.usage?.totalTokens, 30); assert.equal(run.usage?.complete, true);
    const page = f.service.modelRequests(f.run.id, 0, 1);
    assert.equal(page.nextAfter, 1); assert.equal(page.items[0].purpose, 'compaction');
    assert.equal(f.service.modelRequests(f.run.id, 1, 1).items[0].callNumber, 2);
    assert.throws(() => f.service.modelRequests(f.run.id, -1));
    const reopened = new Store(join(f.root, 'workbench.sqlite'));
    try {
      const service = new Service(reopened, new Assets(reopened, f.root));
      assert.deepEqual(service.reserveRequest(f.run.id, 'request-a', undefined, 10, 'compaction'), { callNumber: 1 });
      assert.equal(reopened.get<Run>('run', f.run.id).calls, 2);
    } finally { reopened.close(); }
    f.service.reserveRequest(f.run.id, 'request-c', undefined, 10);
    assert.equal(f.store.get<Run>('run', f.run.id).usage?.complete, false);
  } finally { f.store.close(); }
});

test('API request receipts survive reopen, deduplicate settlement and preserve unknown reservations', () => {
  const f = fixture();
  try {
    f.service.reserveCall(f.run.id, undefined, 10, 'compaction');
    f.service.reserveCall(f.run.id, undefined, 10, 'branch_summary');
    f.service.settleCall(f.run.id, 0.25, usage, 1);
    const before = f.store.get<Run>('run', f.run.id);
    const cursor = f.store.cursor();
    f.service.settleCall(f.run.id, 0.25, usage, 1);
    assert.deepEqual(f.store.get<Run>('run', f.run.id), before);
    assert.equal(f.store.cursor(), cursor);
    assert.equal(before.reservedUsd, 1);
    f.service.transition(f.run.id, 'interrupted', { error: '已对账' });
    const second = new Store(join(f.root, 'workbench.sqlite'));
    try {
      const receipts = second.list<ModelRequestReceipt>('model_request');
      assert.deepEqual(receipts.map(r => [r.purpose, r.state]), [['compaction', 'settled'], ['branch_summary', 'reserved']]);
      const service = new Service(second, new Assets(second, f.root));
      service.settleCall(f.run.id, undefined, undefined, 2);
      const run = second.get<Run>('run', f.run.id);
      assert.equal(run.spentUsd, 1.25); assert.equal(run.reservedUsd, 0);
      const unknown = second.get<ModelRequestReceipt>('model_request', `${f.run.id}:2`);
      assert.equal(unknown.state, 'unknown'); assert.equal(unknown.costUsd, undefined);
      service.settleCall(f.run.id, undefined, undefined, 2);
      assert.deepEqual(second.get<Run>('run', f.run.id), run);
      assert.throws(() => service.settleCall(f.run.id, 1, usage, 3));
    } finally { second.close(); }
  } finally { f.store.close(); }
});

test('subscription unknown receipts remain unknown without inventing a monetary bill', () => {
  const f = fixture(true);
  try {
    f.service.reserveCall(f.run.id, undefined, 0);
    f.service.settleCall(f.run.id, undefined, undefined, 1);
    const receipt = f.store.get<ModelRequestReceipt>('model_request', `${f.run.id}:1`);
    assert.equal(receipt.state, 'unknown'); assert.equal(receipt.costUsd, undefined);
    assert.equal(f.store.get<Run>('run', f.run.id).usage?.complete, false);
    assert.equal(f.store.get<Run>('run', f.run.id).spentUsd, 0);
  } finally { f.store.close(); }
});

test('ledger insertion or settlement failure rolls back budget and receipt together', () => {
  const f = fixture();
  try {
    f.store.db.exec("CREATE TRIGGER deny_request BEFORE INSERT ON entities WHEN NEW.kind='model_request' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    assert.throws(() => f.service.reserveCall(f.run.id, undefined, 10));
    assert.equal(f.store.get<Run>('run', f.run.id).calls, 0);
    f.store.db.exec('DROP TRIGGER deny_request');
    f.service.reserveCall(f.run.id, undefined, 10);
    const before = f.store.get<Run>('run', f.run.id);
    f.store.db.exec("CREATE TRIGGER deny_settlement BEFORE UPDATE ON entities WHEN NEW.kind='model_request' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    assert.throws(() => f.service.settleCall(f.run.id, 0.25, usage, 1));
    assert.deepEqual(f.store.get<Run>('run', f.run.id), before);
    assert.equal(f.store.get<ModelRequestReceipt>('model_request', `${f.run.id}:1`).state, 'reserved');
  } finally { f.store.close(); }
});

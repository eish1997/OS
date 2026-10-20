import test from 'node:test';
import assert from 'node:assert/strict';
import { LayoutAdoption } from '../src/workbench/layout-adoption.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('layout snapshot with the same project applies without opening the canvas', async () => {
  let opened = 0;
  const gate = new LayoutAdoption(async () => { opened += 1; return true; });
  let applied = false;
  const result = await gate.commit(gate.claim(), 'a', 'a', gate.editStamp, () => { applied = true; });
  assert.equal(result, 'applied');
  assert.equal(applied, true);
  assert.equal(opened, 0);
  assert.equal(gate.pending, false);
});

test('layout snapshot switches the canvas before applying and keeps the old layout when the switch fails', async () => {
  const gate = new LayoutAdoption(async () => { throw new Error('save failed'); });
  let applied = false;
  await assert.rejects(gate.commit(gate.claim(), 'a', 'b', gate.editStamp, () => { applied = true; }), /save failed/);
  assert.equal(applied, false);
  assert.equal(gate.pending, false);
});

test('a local edit during the switch reverts the canvas and does not apply the snapshot', async () => {
  const opened: Array<string | null> = [];
  const pending = deferred<boolean>();
  const gate = new LayoutAdoption(async project => { opened.push(project); if (opened.length === 1) return pending.promise; return true; });
  let applied = false;
  const owner = gate.claim();
  const editedAt = gate.editStamp;
  const result = gate.commit(owner, 'a', 'b', editedAt, () => { applied = true; });
  assert.equal(gate.pending, true);
  gate.noteEdit();
  pending.resolve(true);
  assert.equal(await result, 'stale');
  assert.equal(applied, false);
  assert.deepEqual(opened, ['b', 'a']);
});

test('a newer claim supersedes an in-flight snapshot without reverting over the newer project', async () => {
  const opened: Array<string | null> = [];
  const pending = deferred<boolean>();
  const gate = new LayoutAdoption(async project => { opened.push(project); if (opened.length === 1) return pending.promise; return true; });
  let firstApplied = false;
  const first = gate.commit(gate.claim(), 'a', 'b', gate.editStamp, () => { firstApplied = true; });
  const newer = gate.claim();
  pending.resolve(true);
  assert.equal(await first, 'superseded');
  assert.equal(firstApplied, false);
  let secondApplied = false;
  assert.equal(await gate.commit(newer, 'a', 'c', gate.editStamp, () => { secondApplied = true; }), 'applied');
  assert.equal(secondApplied, true);
  assert.deepEqual(opened, ['b', 'c']);
});

test('a failed snapshot write reverts the canvas and leaves the replacement unapplied', async () => {
  const opened: Array<string | null> = [];
  const gate = new LayoutAdoption(async project => { opened.push(project); return true; });
  await assert.rejects(gate.commit(gate.claim(), null, 'b', gate.editStamp, () => { throw new Error('write failed'); }), /write failed/);
  assert.deepEqual(opened, ['b', null]);
});

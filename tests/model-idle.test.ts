import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { withModelIdleDeadline } from '../server/model-idle.js';

test('model network idleness aborts a stalled stream independently of total run duration', async () => {
  let timedOut = 0; let aborted = false;
  const source = async function* (signal: AbortSignal) {
    try { await delay(10000, undefined, { signal }); } catch { aborted = true; }
    yield { type: 'error' };
  };
  for await (const _event of withModelIdleDeadline(source, undefined, 50, () => timedOut++)) {}
  assert.equal(timedOut, 1); assert.equal(aborted, true);
});

test('active stream renews the idle deadline and host settlement after done is not timed as network wait', async () => {
  let timedOut = 0;
  const source = async function* () {
    for (let i = 0; i < 5; i++) { await delay(25); yield { type: 'text_delta' }; }
    yield { type: 'done' };
  };
  for await (const event of withModelIdleDeadline(source, undefined, 100, () => timedOut++)) { if (event.type === 'done') await delay(150); }
  assert.equal(timedOut, 0);
});

test('parent cancellation stays cancellation without an idle-timeout notification', async () => {
  const controller = new AbortController(); let timedOut = 0;
  const source = async function* (signal: AbortSignal) {
    controller.abort();
    try { await delay(10000, undefined, { signal }); } catch {}
    yield { type: 'error' };
  };
  for await (const _event of withModelIdleDeadline(source, controller.signal, 50, () => timedOut++)) {}
  await delay(75); assert.equal(timedOut, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isOperationalRun, selectVisibleRuns } from '../shared/chat-visible-runs.js';
import type { RunStatus } from '../shared/contracts.js';

function run(id: string, status: RunStatus, cancelRequested = false) {
  return { id, status, cancelRequested };
}

test('waiting interaction stays visible with three queued follow-ups', () => {
  const runs = [
    run('active', 'waiting_interaction'),
    run('q1', 'queued'),
    run('q2', 'queued'),
    run('q3', 'queued'),
  ];
  const visible = selectVisibleRuns(runs);
  assert.deepEqual(visible.map((item) => item.id), ['active', 'q1', 'q2', 'q3']);
  assert.equal(visible.length, 4);
  assert(isOperationalRun(runs[0]));
});

test('closed history remains bounded while open runs are never cropped', () => {
  const runs = [
    run('old1', 'failed'),
    run('old2', 'completed'),
    run('old3', 'failed'),
    run('old4', 'completed'),
    run('live', 'running'),
    run('queue', 'queued'),
  ];
  const visible = selectVisibleRuns(runs, 3);
  assert.deepEqual(visible.map((item) => item.id), ['old2', 'old3', 'old4', 'live', 'queue']);
  assert(!visible.some((item) => item.id === 'old1'));
});

test('cancel-requested and interrupted runs stay operational', () => {
  assert(isOperationalRun(run('a', 'running', true)));
  assert(isOperationalRun(run('b', 'interrupted')));
  assert(!isOperationalRun(run('c', 'completed')));
  const visible = selectVisibleRuns([run('done', 'completed'), run('stop', 'running', true), run('irq', 'interrupted')]);
  assert.deepEqual(visible.map((item) => item.id), ['done', 'stop', 'irq']);
});

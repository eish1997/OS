import type { Run, RunStatus } from './contracts.js';

/** Runs that still require operator access: answer, stop, queue, or reconcile. */
const OPEN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'queued',
  'running',
  'waiting_interaction',
  'waiting_user',
  'waiting_node',
  'interrupted',
]);

export function isOperationalRun(run: Pick<Run, 'status' | 'cancelRequested'>): boolean {
  return OPEN_STATUSES.has(run.status) || Boolean(run.cancelRequested);
}

/**
 * Keep every operational run visible, then retain a bounded recent closed history.
 * Ordering follows the input list (oldest → newest).
 */
export function selectVisibleRuns<T extends Pick<Run, 'id' | 'status' | 'cancelRequested'>>(
  runs: readonly T[],
  recentClosedLimit = 3,
): T[] {
  const open = runs.filter(isOperationalRun);
  const closed = runs.filter((run) => !isOperationalRun(run));
  const recentClosed = closed.slice(Math.max(0, closed.length - Math.max(0, recentClosedLimit)));
  const keep = new Set([...open, ...recentClosed].map((run) => run.id));
  return runs.filter((run) => keep.has(run.id));
}

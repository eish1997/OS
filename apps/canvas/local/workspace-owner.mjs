import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// SQLite owns the OS lock: no stale PID files, time-based stealing, or PID reuse race.
// Keep this transaction open until all writers and observers have stopped.
export function acquireWorkspaceOwner(directory) {
  mkdirSync(directory, { recursive: true })
  const db = new DatabaseSync(join(directory, 'service-owner.sqlite'))
  try {
    db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE;')
  } catch {
    db.close()
    throw new Error('Canvas management directory already has an active service')
  }
  let closed = false
  return { close() {
    if (closed) return
    closed = true
    try { db.exec('ROLLBACK') } finally { db.close() }
  } }
}

import { readdirSync, lstatSync, statfsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { StorageCapacity } from '../../../shared/storage-capacity.ts'
import { AppError } from '../../../shared/app-error.ts'

// Bound the synchronous write phase, including B-tree rewrites and rollback
// journals. Conservative admission can reject a large database before its nominal
// byte limit; it must never silently borrow the host's recovery reserve.
function inputSize(value, seen = new Set()) {
  if (typeof value === 'string') return Buffer.byteLength(value)
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (!value || typeof value !== 'object' || seen.has(value)) return 16
  seen.add(value)
  return Object.entries(value).reduce((sum, [key, item]) => sum + Buffer.byteLength(key) + inputSize(item, seen), 32)
}

export function createCanvasAdmission(directory, configuration) {
  if (!configuration) return undefined // Standalone canvas keeps its existing policy.
  if (resolve(directory) !== join(resolve(configuration.dataDir), 'canvas')) throw new Error('Canvas storage root mismatch')
  const capacity = new StorageCapacity(configuration.dataDir, configuration.limits, 1000)
  const activeStores = new WeakSet()
  const estimate = (input, startup = false) => {
    let databaseBytes = 0
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      if (!/\.sqlite(?:-(?:wal|shm))?$/.test(name.name)) continue
      const stat = lstatSync(join(directory, name.name))
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid canvas database path')
      databaseBytes += stat.size
    }
    return 2 * databaseBytes + 8 * inputSize(input) + (startup ? 4 * 1024 ** 2 : 256 * 1024)
  }
  return {
    capacity,
    write(input, operation, startup = false) {
      return capacity.exclusive(() => {
        capacity.assert('canvas', estimate(input, startup))
        return operation()
      })
    },
    initialize(operation) {
      return this.write([], () => {
        const value = operation()
        if (value.db) try {
          // A managed service has one owner and serialized synchronous writes.
          // DELETE journals avoid deferred WAL growth/checkpoints on close after
          // the admission lock has been released. Standalone mode stays unchanged.
          const checkpoint = value.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()
          if (checkpoint.busy) throw new AppError(423, 'Canvas database is busy during initialization')
          const mode = value.db.prepare('PRAGMA journal_mode=DELETE').get().journal_mode
          if (mode !== 'delete') throw new AppError(507, 'Canvas journal mode could not be configured')
          value.db.exec('PRAGMA journal_size_limit=0;')
        } catch (error) { value.db.close(); throw error }
        return value
      }, true)
    },
    guard(store, methods) {
      for (const method of methods) {
        const original = store[method]
        if (typeof original !== 'function' || original.constructor.name === 'AsyncFunction') throw new Error('Admission requires a synchronous write phase')
        const guarded = (...args) => this.write(args, () => {
          // SQLite cannot allocate unbounded new pages even if a future SQL
          // change amplifies a small request beyond the conservative estimate.
          const nested = activeStores.has(store)
          if (!nested) {
            const pageSize = store.db.prepare('PRAGMA page_size').get().page_size
            const pages = store.db.prepare('PRAGMA page_count').get().page_count
            const allowance = 8 * inputSize(args) + 256 * 1024
            store.db.exec(`PRAGMA max_page_count=${pages + Math.floor(allowance / pageSize)}`)
          }
          if (method === 'writeTemporary') {
            const row = args[0], disk = statfsSync(row.directory)
            if (disk.bavail * disk.bsize < row.content.length + capacity.limits.minFreeBytes + capacity.limits.controlReserveBytes) {
              throw new AppError(507, 'Output volume has insufficient free space')
            }
          }
          activeStores.add(store)
          try { return original.apply(store, args) }
          catch (error) {
            if (Number(error.errcode) === 13 || error.code === 'ENOSPC') throw new AppError(507, 'Canvas capacity exhausted; saved revisions are retained')
            throw error
          }
          finally { if (!nested) activeStores.delete(store) }
        })
        // Terminal publication remains successful if best-effort removal has to
        // wait for capacity. Its persisted ownership record remains for retry.
        store[method] = method === 'cleanupFinished' ? (...args) => {
          try { return guarded(...args) } catch (error) {
            if (!(error instanceof AppError && [423, 507].includes(error.status))) throw error
          }
        } : guarded
      }
      return store
    },
  }
}

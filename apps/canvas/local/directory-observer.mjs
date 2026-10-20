import { watch } from 'node:fs'

// Filesystem events are hints. Periodic reconciliation also detects dropped
// events, offline roots and files changed while no editor was connected.
export class DirectoryObserver {
  constructor(files, mounts, { reconcileMs = 10000, leaseMs = 30000 } = {}) {
    this.files = files
    this.mounts = mounts
    this.reconcileMs = reconcileMs
    this.leaseMs = leaseMs
    this.entries = new Map()
  }

  async poll(id) {
    const mount = this.mounts.get(id)
    const identity = this.mounts.identity(id)
    let entry = this.entries.get(id)
    if (entry && (entry.path !== mount.path || entry.availability !== mount.availability || entry.identity !== identity)) {
      this.release(id)
      entry = undefined
    }
    if (!entry) {
      entry = { path: mount.path, availability: mount.availability, identity, dirty: true, lastScan: 0 }
      this.entries.set(id, entry)
      if (mount.availability === 'available') {
        try {
          entry.watcher = watch(mount.path, { persistent: false, recursive: false }, () => { entry.dirty = true })
          entry.watcher.on('error', () => {
            entry.dirty = true
            entry.watcher?.close()
            entry.watcher = undefined
          })
        } catch { /* Periodic reconciliation remains available without a watcher. */ }
      }
    }
    clearTimeout(entry.lease)
    entry.lease = setTimeout(() => this.release(id), this.leaseMs)
    entry.lease.unref()
    if (entry.dirty || Date.now() - entry.lastScan >= this.reconcileMs) {
      // Clear before awaiting: an event during enumeration must request another scan.
      entry.dirty = false
      try {
        const result = await this.files.scan(id)
        entry.lastScan = Date.now()
        if (result.scanStatus === 'incomplete') entry.dirty = true
        return result
      } catch (error) { entry.dirty = true; throw error }
    }
    return { ...this.files.list(id), scanStatus: mount.availability === 'available' ? 'complete' : mount.availability }
  }

  release(id) {
    const entry = this.entries.get(id)
    if (!entry) return
    clearTimeout(entry.lease)
    entry.watcher?.close()
    this.entries.delete(id)
  }

  close() {
    for (const id of this.entries.keys()) this.release(id)
  }
}

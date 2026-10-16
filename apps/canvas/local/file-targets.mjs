import { randomUUID } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute } from 'node:path'
import { WorkspaceError } from './workspace-store.mjs'

// Resolve explicit user-selected file targets without merging existing assets.
// The editor changes a node reference only after confirmation and owns its undo.
export class FileTargets {
  constructor(files, mounts) { this.files = files; this.mounts = mounts; this.previews = new Map() }
  inspect(path) {
    let info
    try { info = lstatSync(path, { bigint: true }) }
    catch { throw new WorkspaceError('invalid', 'Target file is unavailable') }
    if (!info.isFile() || info.isSymbolicLink() || info.ino === 0n) {
      throw new WorkspaceError('invalid', 'Choose a regular file with a reliable identity')
    }
    return `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`
  }
  async preview(path) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
      throw new WorkspaceError('invalid', 'An absolute target file path is required')
    }
    this.inspect(path)
    const canonical = realpathSync.native(path)
    const signature = this.inspect(canonical)
    const now = Date.now()
    for (const [key, value] of this.previews) if (value.expires <= now) this.previews.delete(key)
    if (this.previews.size >= 256) this.previews.delete(this.previews.keys().next().value)
    const token = randomUUID()
    this.previews.set(token, { path: canonical, signature, expires: now + 300000 })
    return { token, path: canonical, size: signature.split(':')[3] }
  }
  async confirm(token) {
    const preview = this.previews.get(token)
    if (!preview || preview.expires <= Date.now()) throw new WorkspaceError('conflict', 'Preview expired')
    if (this.inspect(preview.path) !== preview.signature) throw new WorkspaceError('conflict', 'Target changed after preview')
    const mount = this.mounts.add(dirname(preview.path))
    const scan = await this.files.scan(mount.id)
    const entry = scan.entries.find(item => item.path === basename(preview.path))
    if (scan.scanStatus !== 'complete' || entry?.availability !== 'available' ||
        entry.kind !== 'file' ||
        this.inspect(preview.path) !== preview.signature) {
      throw new WorkspaceError('conflict', 'Target changed after preview')
    }
    return entry
  }
}

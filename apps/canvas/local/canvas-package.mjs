import { createHash, randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { posix, win32 } from 'node:path'
import { WorkspaceError } from './workspace-store.mjs'

const MAGIC = Buffer.from('OSCANVAS1\n')
const MAX_PACKAGE_BYTES = 350 * 1024 * 1024
const MAX_DECODED_BYTES = 512 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = message => { throw new WorkspaceError('invalid', message) }
const requireId = value => { if (typeof value !== 'string' || !UUID.test(value)) invalid('Invalid package identifier') }

export function validateReferences(value) {
  if (!record(value) || value.formatVersion !== 1 || !Array.isArray(value.mounts) || !Array.isArray(value.files)) {
    invalid('Invalid package reference manifest')
  }
  const mounts = new Set(), files = new Set(), canvases = new Set(), paths = new Set(), filePaths = new Set()
  for (const mount of value.mounts) {
    if (!record(mount)) invalid('Invalid directory reference')
    requireId(mount.id); requireId(mount.canvasId)
    if (mounts.has(mount.id)) invalid('Duplicate directory reference')
    if (typeof mount.path !== 'string' || mount.path.length > 32768 || mount.path.includes('\0') ||
        (!posix.isAbsolute(mount.path) && !win32.isAbsolute(mount.path))) invalid('Invalid directory reference path')
    if (canvases.has(mount.canvasId) || paths.has(mount.path)) invalid('Duplicate directory canvas or path')
    canvases.add(mount.canvasId); paths.add(mount.path)
    mounts.add(mount.id)
  }
  for (const file of value.files) {
    if (!record(file)) invalid('Invalid file reference')
    requireId(file.id); requireId(file.mountId)
    if (files.has(file.id) || !mounts.has(file.mountId)) invalid('Duplicate or unbound file reference')
    if (typeof file.path !== 'string' || !file.path || file.path === '.' || file.path === '..' || /[\\/\0]/.test(file.path)) {
      invalid('File references must be direct children of their directory')
    }
    const key = JSON.stringify([file.mountId, file.path])
    if (filePaths.has(key)) invalid('Duplicate file reference path')
    filePaths.add(key)
    if (!['file', 'directory', 'link', 'other'].includes(file.kind) ||
        !['available', 'missing', 'replaced'].includes(file.availability) ||
        typeof file.size !== 'string' || !/^\d+$/.test(file.size) ||
        !Number.isSafeInteger(file.revision) || file.revision < 1) invalid('Invalid file reference metadata')
    files.add(file.id)
  }
  return mounts
}

function validateLayout(layout) {
  if (!record(layout) || layout.formatVersion !== 1 || !record(layout.panels) ||
      typeof layout.panels.layers !== 'boolean' || typeof layout.panels.properties !== 'boolean') invalid('Invalid package layout')
  if (Buffer.byteLength(JSON.stringify(layout)) > 64 * 1024) invalid('Package layout is too large')
}

function validateManifest(manifest) {
  if (!record(manifest) || manifest.format !== 'os-canvas' || manifest.formatVersion !== 1) {
    throw new WorkspaceError('unsupported-version', 'Unsupported canvas package format')
  }
  requireId(manifest.packageId); requireId(manifest.canvasId)
  if (manifest.externalFiles !== 'references-only') invalid('Unsupported external file payload policy')
  if (!Number.isSafeInteger(manifest.headRevision) || manifest.headRevision < 1 ||
      !Array.isArray(manifest.revisions) || manifest.revisions.length !== manifest.headRevision ||
      !record(manifest.scenes)) invalid('Incomplete canvas revision manifest')
  validateLayout(manifest.layout)
  const mounts = validateReferences(manifest.references)
  const referenced = new Set()
  manifest.revisions.forEach((revision, index) => {
    if (!record(revision) || revision.revision !== index + 1 || typeof revision.sceneHash !== 'string' || !HASH.test(revision.sceneHash) ||
        typeof revision.createdAt !== 'string' || !Number.isFinite(Date.parse(revision.createdAt)) ||
        !record(revision.metadata) || revision.metadata.formatVersion !== 1) invalid('Invalid canvas revision')
    if (Buffer.byteLength(JSON.stringify(revision.metadata)) > 1024 * 1024) invalid('Revision metadata is too large')
    if (revision.metadata.mountId && !mounts.has(revision.metadata.mountId)) invalid('Canvas directory reference is missing')
    referenced.add(revision.sceneHash)
  })
  const scenes = new Map()
  for (const [hash, encoded] of Object.entries(manifest.scenes)) {
    if (!HASH.test(hash) || !referenced.has(hash) || typeof encoded !== 'string') invalid('Unexpected scene payload')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.length > 256 * 1024 * 1024 || bytes.toString('base64') !== encoded) invalid('Invalid scene payload encoding')
    if (digest(bytes) !== hash) throw new WorkspaceError('corrupt', 'Canvas package scene checksum mismatch')
    scenes.set(hash, bytes)
  }
  if (scenes.size !== referenced.size) invalid('Canvas package is missing scene payloads')
  return { manifest, scenes }
}

/** Only explicitly supplied work data is packaged; no settings, credentials or process state. */
export function encodeCanvasPackage({ canvasId, revisions, layout, references }) {
  requireId(canvasId)
  if (!Array.isArray(revisions) || !revisions.length) invalid('A saved canvas is required')
  const scenes = Object.create(null)
  const entries = [...revisions].sort((a, b) => a.revision - b.revision).map(revision => {
    if (revision.canvasId !== canvasId || !(revision.scene instanceof Uint8Array)) invalid('Canvas revision identity mismatch')
    const hash = digest(revision.scene)
    if (hash !== revision.sceneHash) throw new WorkspaceError('corrupt', 'Saved scene checksum mismatch')
    scenes[hash] = Buffer.from(revision.scene).toString('base64')
    return { revision: revision.revision, sceneHash: hash, metadata: revision.metadata, createdAt: revision.createdAt }
  })
  const manifest = { format: 'os-canvas', formatVersion: 1, packageId: randomUUID(), canvasId,
    headRevision: entries.at(-1).revision, externalFiles: 'references-only', revisions: entries, scenes, layout, references }
  validateManifest(manifest)
  const bytes = Buffer.from(JSON.stringify(manifest))
  if (bytes.length > MAX_DECODED_BYTES) throw new WorkspaceError('too-large', 'Canvas package exceeds its decoded size limit')
  const output = Buffer.concat([MAGIC, gzipSync(bytes)])
  if (output.length > MAX_PACKAGE_BYTES) throw new WorkspaceError('too-large', 'Canvas package exceeds its size limit')
  return output
}

/** Decode in memory; payload paths never become extraction paths or executable code. */
export function decodeCanvasPackage(bytes, { maxDecodedBytes = MAX_DECODED_BYTES } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_PACKAGE_BYTES) invalid('Invalid canvas package bytes')
  if (!Number.isSafeInteger(maxDecodedBytes) || maxDecodedBytes < 1 || maxDecodedBytes > MAX_DECODED_BYTES) invalid('Invalid decoding limit')
  const input = Buffer.from(bytes)
  if (!input.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new WorkspaceError('unsupported-version', 'Unsupported canvas package header')
  }
  let decoded
  try { decoded = gunzipSync(input.subarray(MAGIC.length), { maxOutputLength: maxDecodedBytes }) }
  catch (error) {
    if (error.code === 'ERR_BUFFER_TOO_LARGE') throw new WorkspaceError('too-large', 'Canvas package exceeds its decoded size limit')
    throw new WorkspaceError('corrupt', 'Canvas package compression is damaged')
  }
  let manifest
  try { manifest = JSON.parse(decoded.toString('utf8')) }
  catch { throw new WorkspaceError('corrupt', 'Canvas package manifest is damaged') }
  return validateManifest(manifest)
}

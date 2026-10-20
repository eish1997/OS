import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { decodeCanvasPackage, encodeCanvasPackage } from '../local/canvas-package.mjs'
import { parseFigBuffer, writeFigArchive } from '../../../.runtime/open-pencil-upstream/packages/fig/dist/index.js'
import { compileSchema, decodeBinarySchema, ByteBuffer } from '../../../.runtime/open-pencil-upstream/packages/kiwi/dist/schema-runtime.js'

const evidence = resolve('output/dev-evidence/canvas-c05/performance/native/save-20mib')
await mkdir(evidence, { recursive: true })
const work = await mkdtemp(join(evidence, 'images-'))
const source = decodeCanvasPackage(await readFile('output/dev-evidence/canvas-c05/performance/native/fixture.oscanvas'))
const scene = source.scenes.get(source.manifest.revisions[0].sceneHash)
const parsed = parseFigBuffer(scene.buffer.slice(scene.byteOffset, scene.byteOffset + scene.byteLength))
assert.equal(parsed.images.length, 200)
const inputs = []
for (const [index, [hash, bytes]] of parsed.images.entries()) {
  const file = `input-${index}.jpg`
  await writeFile(join(work, file), bytes)
  inputs.push({ hash, file })
}
await writeFile(join(work, 'inputs.json'), JSON.stringify(inputs))
// At least 20 MiB of real images, plus the genuine scene records. No filler bytes.
const target = 20 * 1024 ** 2
await promisify(execFile)('python', ['apps/canvas/probes/resize-scale-images.py', work, String(target)],
  { windowsHide: true, timeout: 180000 })
const converted = JSON.parse(await readFile(join(work, 'outputs.json'), 'utf8'))
const hashes = new Map(converted.images.map(image => [image.oldHash, image.hash]))
let references = 0
for (const node of parsed.nodeChanges) {
  for (const paint of node.fillPaints ?? []) {
    if (paint.type !== 'IMAGE') continue
    const previous = Buffer.from(Object.values(paint.image.hash)).toString('hex')
    assert.ok(hashes.has(previous))
    paint.image.hash = new Uint8Array(Buffer.from(hashes.get(previous), 'hex'))
    references++
  }
}
assert.equal(references, 200)
const { inflateSync } = createRequire(resolve('.runtime/open-pencil-upstream/package.json'))('fflate')
const compiled = compileSchema(decodeBinarySchema(new ByteBuffer(inflateSync(parsed.figSchemaDeflated))))
const kiwiData = compiled.encodeMessage({ type: 'NODE_CHANGES', sessionID: 0, ackID: 0,
  nodeChanges: parsed.nodeChanges, blobs: parsed.blobs.map(bytes => ({ bytes })) })
const images = await Promise.all(converted.images.map(async image => ({ name: `images/${image.hash}`, data: await readFile(join(work, image.file)) })))
const resized = writeFigArchive({ schemaDeflated: parsed.figSchemaDeflated, kiwiData,
  thumbnailPNG: parsed.thumbnailPNG, metaJSON: parsed.metaJSON, images, figKiwiVersion: parsed.figKiwiVersion })
assert.ok(resized.byteLength >= target && resized.byteLength <= target + 256 * 1024)
const verify = parseFigBuffer(resized.buffer.slice(resized.byteOffset, resized.byteOffset + resized.byteLength))
assert.equal(verify.images.length, 200)
assert.equal(verify.nodeChanges.filter(node => node.type === 'RECTANGLE').length, 1000)
const canvasId = randomUUID(), name = `Native save 20MiB ${canvasId}`
const bytes = encodeCanvasPackage({ canvasId, references: source.manifest.references, layout: source.manifest.layout,
  revisions: [{ ...source.manifest.revisions[0], canvasId, revision: 1, scene: resized,
    sceneHash: createHash('sha256').update(resized).digest('hex'), metadata: { ...source.manifest.revisions[0].metadata, name } }] })
await writeFile(join(evidence, 'fixture.oscanvas'), bytes)
await writeFile(join(evidence, 'fixture.json'), JSON.stringify({ canvasId, name, snapshotBytes: resized.byteLength,
  targetMinimumBytes: target, imageBytes: converted.bytes, qualities: converted.qualities,
  objects: 1000, distinctImages: 200, width: 1920, height: 1080, work,
  scope: 'At least 20 MiB, at most 20.25 MiB valid FIG; all 200 actual JPEG images retained at full dimensions; no padding' }, null, 2))
console.log(JSON.stringify({ canvasId, snapshotBytes: resized.byteLength }))

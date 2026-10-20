import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MountStore } from './mount-store.mjs'
import { OutputStore } from './output-store.mjs'
import { FileIndex } from './file-index.mjs'

// The filesystem fault shim exists only in a separate test process. Product code
// has no fault flag. process.exit bypasses store cleanup and leaves real WAL/files.
const childCode = `
  import fs from 'node:fs';
  import childProcess from 'node:child_process';
  import { syncBuiltinESMExports } from 'node:module';
  const [outputURL, mountURL, directory, operation, mode] = process.argv.slice(1);
  const write = fs.writeFileSync, link = fs.linkSync, open = fs.openSync;
  if (mode.startsWith('native-')) fs.linkSync = (source, target) => {
    if (mode === 'native-conflict') write(target, 'external racing file');
    throw Object.assign(new Error('injected unsupported hard link'), { code: 'ENOTSUP' });
  };
  if (mode === 'native-interrupt') {
    const run = childProcess.spawnSync;
    childProcess.spawnSync = (...args) => {
      const result = run(...args);
      if (result.status === 0) process.exit(73);
      return result;
    };
  }
  if (mode === 'mid-write' || mode === 'disk-full') fs.writeFileSync = (fd, bytes, ...rest) => {
    write(fd, bytes.subarray(0, 7), ...rest);
    if (mode === 'mid-write') process.exit(73);
    throw Object.assign(new Error('injected full disk'), { code: 'ENOSPC' });
  };
  if (mode === 'after-publish') fs.linkSync = (...args) => { link(...args); process.exit(73); };
  if (mode === 'write-protected') fs.openSync = (path, flags, ...rest) => {
    if (flags === 'wx') throw Object.assign(new Error('injected write protection'), { code: 'EACCES' });
    return open(path, flags, ...rest);
  };
  syncBuiltinESMExports();
  const { MountStore } = await import(mountURL);
  const { OutputStore } = await import(outputURL);
  const mounts = new MountStore(directory), outputs = new OutputStore(directory, mounts);
  try { outputs.commit(operation); process.exit(0); }
  catch (error) { console.log(JSON.stringify({ code: error.code })); process.exit(74); }
`

for (const mode of ['mid-write', 'after-publish', 'disk-full', 'write-protected']) {
  test(`output recovery after ${mode} keeps content and reuses the same operation`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'canvas-output-recovery-')), root = join(directory, 'assets')
    mkdirSync(root)
    let mounts = new MountStore(directory), outputs = new OutputStore(directory, mounts)
    const mount = mounts.add(root)
    const content = Buffer.from('完整中文成果\n' + 'abcdefgh'.repeat(8192))
    const input = { operationId: randomUUID(), canvasId: mount.canvasId, nodeId: randomUUID(),
      sourceRevision: 1, mountId: mount.id, name: 'recovered.txt', content }
    outputs.prepare(input); outputs.close(); mounts.close()
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', childCode,
      new URL('./output-store.mjs', import.meta.url).href, new URL('./mount-store.mjs', import.meta.url).href,
      directory, input.operationId, mode], { encoding: 'utf8', timeout: 10000 })
    assert.equal(child.error, undefined)
    assert.equal(child.status, ['disk-full', 'write-protected'].includes(mode) ? 74 : 73, child.stderr)
    if (mode === 'disk-full') assert.equal(JSON.parse(child.stdout).code, 'ENOSPC')
    if (mode === 'write-protected') assert.equal(JSON.parse(child.stdout).code, 'EACCES')
    assert.equal(existsSync(join(root, input.name)), mode === 'after-publish')
    mounts = new MountStore(directory); outputs = new OutputStore(directory, mounts)
    const files = new FileIndex(directory, mounts, { ignoredNames: id => outputs.temporaryNames(id),
      outputOrigins: (id, rows) => outputs.origins(id, rows) })
    try {
      const row = outputs.row(input.operationId)
      assert.equal(row.state, mode === 'after-publish' ? 'ready' : 'prepared')
      assert.deepEqual(Buffer.from(row.content), content, 'durable input survives incomplete publication')
      const before = await files.scan(mount.id)
      assert.equal(before.entries.length, mode === 'after-publish' ? 1 : 0)
      const committed = outputs.commit(input.operationId)
      assert.equal(committed.state, 'committed')
      assert.deepEqual(readFileSync(join(root, input.name)), content)
      if (mode === 'after-publish') assert.equal(committed.fileIdentity, row.file_identity)
      assert.deepEqual(outputs.commit(input.operationId), committed)
      const after = await files.scan(mount.id)
      assert.equal(after.entries.length, 1)
      assert.equal(after.entries[0].outputOrigin.operationId, input.operationId)
      assert.equal(readdirSync(root).filter(name => name === input.name).length, 1)
      assert.deepEqual(readdirSync(root), [input.name], 'finished operation cleans its interrupted partial files')
    } finally { await files.close(); outputs.close(); mounts.close() }
  })
}

for (const mode of ['native-publish', 'native-interrupt', 'native-conflict']) {
  test(`hard-link fallback ${mode} uses real native move and retains journal recovery`, { skip: process.platform !== 'win32' }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'canvas-native-recovery-')), root = join(directory, 'assets')
    mkdirSync(root)
    const mounts = new MountStore(directory), outputs = new OutputStore(directory, mounts)
    try {
      const mount = mounts.add(root), operationId = randomUUID()
      outputs.prepare({ operationId, canvasId: mount.canvasId, nodeId: randomUUID(), sourceRevision: 1,
        mountId: mount.id, name: 'native.txt', content: Buffer.from('native original snapshot') })
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', childCode,
        new URL('./output-store.mjs', import.meta.url).href, new URL('./mount-store.mjs', import.meta.url).href,
        directory, operationId, mode], { encoding: 'utf8', timeout: 20000 })
      assert.equal(child.error, undefined)
      assert.equal(child.status, { 'native-publish': 0, 'native-interrupt': 73, 'native-conflict': 74 }[mode], child.stderr)
      const row = outputs.row(operationId)
      if (mode === 'native-conflict') {
        assert.equal(JSON.parse(child.stdout).code, 'conflict')
        assert.equal(readFileSync(join(root, 'native.txt'), 'utf8'), 'external racing file')
        assert.equal(row.state, 'ready')
        outputs.cancel(operationId)
        assert.deepEqual(readdirSync(root), ['native.txt'])
      } else {
        assert.equal(row.state, mode === 'native-interrupt' ? 'ready' : 'committed')
        assert.equal(existsSync(join(root, row.temporary)), false, 'native move consumes source path')
        const finished = outputs.commit(operationId)
        assert.equal(finished.fileIdentity, row.file_identity)
        assert.equal(finished.state, 'committed')
        assert.equal(readFileSync(join(root, 'native.txt'), 'utf8'), 'native original snapshot')
        assert.deepEqual(outputs.commit(operationId), finished)
        assert.deepEqual(readdirSync(root), ['native.txt'])
      }
    } finally { outputs.close(); mounts.close() }
  })
}

for (const changed of [false, true]) {
  test(`cancel after process exit ${changed ? 'retains external edits' : 'cleans owned partial bytes'}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'canvas-cancel-partial-')), root = join(directory, 'assets')
    mkdirSync(root)
    const mounts = new MountStore(directory), outputs = new OutputStore(directory, mounts)
    try {
      const mount = mounts.add(root), operationId = randomUUID()
      outputs.prepare({ operationId, canvasId: mount.canvasId, nodeId: randomUUID(), sourceRevision: 1,
        mountId: mount.id, name: 'cancelled.txt', content: Buffer.from('original snapshot bytes') })
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', childCode,
        new URL('./output-store.mjs', import.meta.url).href, new URL('./mount-store.mjs', import.meta.url).href,
        directory, operationId, 'mid-write'], { encoding: 'utf8', timeout: 10000 })
      assert.equal(child.status, 73, child.stderr)
      const temporary = readdirSync(root)[0]
      assert.ok(temporary)
      if (changed) writeFileSync(join(root, temporary), 'external content')
      outputs.cancel(operationId)
      assert.equal(outputs.temporaryNames(mount.id).size, 0)
      assert.deepEqual(readdirSync(root), changed ? [temporary] : [])
      if (changed) assert.equal(readFileSync(join(root, temporary), 'utf8'), 'external content')
      assert.equal(Buffer.from(outputs.row(operationId).content).toString(), 'original snapshot bytes')
      assert.throws(() => outputs.commit(operationId), { code: 'conflict' })
    } finally { outputs.close(); mounts.close() }
  })
}

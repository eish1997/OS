import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, lstatSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moveWindowsNoReplace } from './publish-file.mjs'

test('Windows native publication keeps file identity, literal filenames and no-overwrite semantics', { skip: process.platform !== 'win32' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'canvas-native-move-'))
  const source = join(root, 'prepared.tmp'), target = join(root, "中文 $(whoami) ` '.txt")
  writeFileSync(source, 'original bytes')
  const before = lstatSync(source, { bigint: true })
  moveWindowsNoReplace(source, target)
  assert.equal(existsSync(source), false)
  const after = lstatSync(target, { bigint: true })
  assert.equal(before.ino, after.ino); assert.equal(before.birthtimeNs, after.birthtimeNs)
  assert.equal(readFileSync(target, 'utf8'), 'original bytes')
  writeFileSync(source, 'new bytes')
  assert.throws(() => moveWindowsNoReplace(source, target), { code: 'EEXIST' })
  assert.equal(readFileSync(source, 'utf8'), 'new bytes')
  assert.equal(readFileSync(target, 'utf8'), 'original bytes')
  mkdirSync(join(root, 'other'))
  assert.throws(() => moveWindowsNoReplace(source, join(root, 'other', 'target.txt')), { code: 'ENOTSUP' })
  assert.equal(readFileSync(source, 'utf8'), 'new bytes')
})

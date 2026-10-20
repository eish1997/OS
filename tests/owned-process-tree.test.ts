import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { terminateOwnedProcessTree, terminateProcessTreeByPid } from '../server/owned-process.js';

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    return code !== 'ESRCH';
  }
}

async function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'owned-tree-'));
  const pidFile = join(dir, 'child.pid');
  const parent = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);`, pidFile], { stdio: 'ignore', windowsHide: true });
  await once(parent, 'spawn');
  let childPid = 0;
  for (let i = 0; i < 50 && !childPid; i++) {
    await delay(50);
    try { childPid = Number(readFileSync(pidFile, 'utf8')); } catch { /* not written yet */ }
  }
  assert.ok(childPid > 0);
  return { parent, childPid };
}

test('taskkill failure still confirms cleanup of the snapshotted tree', { timeout: 30000, skip: process.platform !== 'win32' }, async () => {
  const { parent, childPid } = await tree();
  const ok = await terminateOwnedProcessTree(parent, async () => false);
  assert.equal(ok, true);
  assert.equal(alive(parent.pid!), false);
  assert.equal(alive(childPid), false);
});

test('a root that is already gone does not count as a confirmed tree cleanup', { timeout: 20000, skip: process.platform !== 'win32' }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await once(child, 'spawn');
  const pid = child.pid!;
  child.kill();
  await once(child, 'exit');
  assert.equal(await terminateProcessTreeByPid(pid), false);
});

test('a child born after the first listing is stopped with the root', { timeout: 20000, skip: process.platform !== 'win32' }, async () => {
  const late = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await once(late, 'spawn');
  const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await once(parent, 'spawn');
  let listings = 0;
  try {
    const ok = await terminateProcessTreeByPid(parent.pid!, async pid => { try { process.kill(pid); } catch { /* already gone */ } return false; }, async () => {
      listings += 1;
      const rows = [{ pid: parent.pid!, ppid: process.pid }];
      if (listings > 1) rows.push({ pid: late.pid!, ppid: parent.pid! });
      return rows;
    });
    assert.equal(ok, true);
    assert.ok(listings >= 2);
    assert.equal(alive(parent.pid!), false);
    assert.equal(alive(late.pid!), false);
  } finally {
    if (alive(parent.pid!)) parent.kill();
    if (alive(late.pid!)) late.kill();
  }
});

test('natural exit after a live snapshot is confirmed when no descendant remains', { timeout: 30000, skip: process.platform !== 'win32' }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await once(child, 'spawn');
  const ok = await terminateOwnedProcessTree(child, async pid => { process.kill(pid); return false; });
  assert.equal(ok, true);
  assert.equal(alive(child.pid!), false);
});

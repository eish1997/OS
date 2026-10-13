import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Store } from '../server/store.js';
import { Assets } from '../server/assets.js';
import { Service } from '../server/service.js';
import type { Asset } from '../shared/contracts.js';
for (const stage of ['staged', 'intent', 'renamed', 'registered']) test(`actual process kill at asset ${stage} recovers without false-ready or duplicate registration`, async () => {
  const dir = mkdtempSync(join(tmpdir(), '真实 存储崩溃 '));
  const child = fork(resolve('tests/helpers/crash-asset.ts'), [dir, stage], { execPath: process.execPath, execArgv: ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const message = await new Promise<{ uploadId: string }>((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(new Error('crash fixture timeout')); }, 10000); child.once('message', value => { clearTimeout(timer); resolve(value as { uploadId: string }); }); child.once('error', reject); });
  const exited = new Promise<void>(r => child.once('exit', () => r())); child.kill(); await exited;
  const store = new Store(join(dir, 'workbench.sqlite')); const assets = new Assets(store, dir);
  if (stage === 'staged') { assert.equal(store.list('asset').length, 0); assets.commit(message.uploadId, Buffer.from('fixed crash evidence')); }
  assert.equal(store.list('asset').length, 1); assert.equal(assets.read(store.list<Asset>('asset')[0]).toString(), 'fixed crash evidence'); assets.reconcile(); assert.equal(store.list('asset').length, 1); store.close();
});
test('Windows exclusive file occupancy fails safely and retry succeeds after release', { skip: process.platform !== 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), '文件 占用 ')); const store = new Store(join(dir, 'workbench.sqlite')); const assets = new Assets(store, dir); const p = new Service(store, assets).createProject('A'); const upload = assets.begin(p.id, 'locked.md', 'text/plain'); const path = join(assets.temp, upload.id); writeFileSync(path, 'fixed');
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('tests/helpers/lock-file.ps1'), '-Path', path], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(new Error('lock timeout')); }, 10000); child.stdout.on('data', value => { if (value.toString().includes('READY')) { clearTimeout(timer); resolve(); } }); child.once('error', reject); });
  try { assert.throws(() => assets.commit(upload.id, Buffer.from('fixed'))); assert.equal(store.list('asset').length, 0); }
  finally { const exited = new Promise<void>(r => child.once('exit', () => r())); child.stdin.end('release\n'); await exited; }
  const asset = assets.commit(upload.id, Buffer.from('fixed')); assert.equal(assets.read(asset).toString(), 'fixed'); store.close();
});

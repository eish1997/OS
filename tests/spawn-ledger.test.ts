import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stopRecordedSpawnProcesses } from '../server/spawn-ledger.js';

function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return !(error instanceof Error && 'code' in error && error.code === 'ESRCH'); }
}

test('Pi shell spawn is recorded before the worker exits and its later child is stopped with it', { timeout: 40000, skip: process.platform !== 'win32' }, async () => {
  const data = mkdtempSync(join(tmpdir(), 'spawn-ledger-'));
  const projectId = 'project';
  const runId = 'run';
  const dir = join(data, 'sessions', projectId, '.output', runId);
  mkdirSync(dir, { recursive: true });
  const ledger = join(dir, 'processes.jsonl');
  const grandFile = join(dir, 'grand.txt');
  const decoy = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  const helper = fileURLToPath(new URL('./helpers/spawn-ledger-child.ts', import.meta.url));
  const preload = pathToFileURL(resolve('server/spawn-ledger-register.mjs')).href;
  const child = spawn(process.execPath, ['--import', preload, '--import', 'tsx', helper, ledger, grandFile], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, DULSE_SPAWN_LEDGER: ledger } });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  try {
    assert.ok(decoy.pid);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !(existsSync(grandFile) && existsSync(ledger) && readFileSync(ledger, 'utf8').includes('"created"'))) await delay(50);
    assert.equal(existsSync(ledger), true, `${stderr}\n${existsSync(`${ledger}.error`) ? readFileSync(`${ledger}.error`, 'utf8') : ''}`);
    const detail = [stderr, existsSync(`${ledger}.result`) ? readFileSync(`${ledger}.result`, 'utf8') : '', existsSync(`${ledger}.output`) ? readFileSync(`${ledger}.output`, 'utf8') : '', existsSync(`${ledger}.error`) ? readFileSync(`${ledger}.error`, 'utf8') : ''].join('\n');
    assert.match(readFileSync(ledger, 'utf8'), /"created"/, detail);
    assert.equal(existsSync(grandFile), true, stderr);
    const grandPid = Number(readFileSync(grandFile, 'utf8'));
    writeFileSync(ledger, JSON.stringify({ pid: decoy.pid, created: 'not-this-process' }) + '\n', { flag: 'a' });
    await stopRecordedSpawnProcesses(data, projectId, runId);
    const gone = Date.now() + 8000;
    while ((child.exitCode === null || alive(grandPid)) && Date.now() < gone) await delay(50);
    assert.equal(alive(grandPid), false);
    assert.equal(alive(decoy.pid), true);
    assert.equal(existsSync(resolve(ledger)), true);
  } finally {
    if (decoy.pid && alive(decoy.pid)) decoy.kill();
    if (child.exitCode === null) child.kill();
  }
});

test('a grandchild recorded while its shell was alive is stopped after that shell has exited', { timeout: 45000, skip: process.platform !== 'win32' }, async () => {
  const data = mkdtempSync(join(tmpdir(), 'spawn-ledger-exit-'));
  const projectId = 'project';
  const runId = 'run';
  const dir = join(data, 'sessions', projectId, '.output', runId);
  mkdirSync(dir, { recursive: true });
  const ledger = join(dir, 'processes.jsonl');
  const grandFile = join(dir, 'grand.txt');
  const releaseFile = join(dir, 'release');
  const decoy = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  const helper = fileURLToPath(new URL('./helpers/spawn-ledger-child.ts', import.meta.url));
  const preload = pathToFileURL(resolve('server/spawn-ledger-register.mjs')).href;
  const child = spawn(process.execPath, ['--import', preload, '--import', 'tsx', helper, ledger, grandFile, 'exit', releaseFile], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, DULSE_SPAWN_LEDGER: ledger } });
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr += String(chunk); });
  let grandPid = 0;
  try {
    assert.ok(decoy.pid);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (existsSync(grandFile)) grandPid = Number(readFileSync(grandFile, 'utf8'));
      const recorded = grandPid > 0 && existsSync(ledger) && readFileSync(ledger, 'utf8').split('\n').some(line => line.includes(`"pid":${grandPid}`) && line.includes('"created"'));
      if (recorded && child.exitCode === null) break;
      await delay(50);
    }
    const detail = () => [stderr, existsSync(`${ledger}.result`) ? readFileSync(`${ledger}.result`, 'utf8') : '', existsSync(`${ledger}.error`) ? readFileSync(`${ledger}.error`, 'utf8') : '', existsSync(ledger) ? readFileSync(ledger, 'utf8') : ''].join('\n');
    assert.ok(grandPid > 0, detail());
    assert.ok(readFileSync(ledger, 'utf8').split('\n').some(line => line.includes(`"pid":${grandPid}`) && line.includes('"created"')), detail());
    writeFileSync(releaseFile, '1');
    const exited = Date.now() + 15000;
    while (child.exitCode === null && Date.now() < exited) await delay(50);
    assert.equal(child.exitCode, 0, detail());
    assert.equal(alive(grandPid), true, detail());
    writeFileSync(ledger, JSON.stringify({ pid: decoy.pid, created: 'not-this-process' }) + '\n', { flag: 'a' });
    await stopRecordedSpawnProcesses(data, projectId, runId);
    const gone = Date.now() + 8000;
    while (alive(grandPid) && Date.now() < gone) await delay(50);
    assert.equal(alive(grandPid), false);
    assert.equal(alive(decoy.pid), true);
  } finally {
    if (grandPid && alive(grandPid)) process.kill(grandPid);
    if (decoy.pid && alive(decoy.pid)) decoy.kill();
    if (child.exitCode === null) child.kill();
  }
});

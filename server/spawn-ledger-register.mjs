import { createRequire } from 'node:module';
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const originalSpawn = childProcess.spawn;

function appendRecord(file, record) {
  const directory = dirname(file);
  const dirInfo = lstatSync(directory);
  if (dirInfo.isSymbolicLink() || !dirInfo.isDirectory()) return;
  if (existsSync(file)) {
    const info = lstatSync(file);
    if (info.isSymbolicLink() || !info.isFile() || info.size > 1024 * 1024) return;
  }
  const fd = openSync(file, 'a');
  try { writeSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
}

function processCreation(pid) {
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot || !Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve(null);
  const command = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if(-not $p){exit 2}; $p.CreationDate.ToUniversalTime().ToString('o')`;
  return new Promise(resolve => {
    childProcess.execFile(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      resolve(error ? null : String(stdout).trim() || null);
    });
  });
}

function listProcesses() {
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot) return Promise.resolve(null);
  const command = "Get-CimInstance Win32_Process | ForEach-Object { '{0},{1},{2}' -f $_.ProcessId, $_.ParentProcessId, $_.CreationDate.ToUniversalTime().ToString('o') }";
  return new Promise(resolve => {
    childProcess.execFile(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve(null); return; }
      const rows = [];
      for (const line of String(stdout).split(/\r?\n/)) {
        const match = /^(\d+),(\d+),(.*)$/.exec(line.trim());
        if (!match) continue;
        const created = match[3].trim();
        if (!created || created.length > 80) continue;
        rows.push({ pid: Number(match[1]), ppid: Number(match[2]), created });
      }
      resolve(rows.length ? rows : null);
    });
  });
}

function descendants(root, rows) {
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const children = new Map();
  for (const row of rows) {
    const list = children.get(row.ppid);
    if (list) list.push(row.pid); else children.set(row.ppid, [row.pid]);
  }
  const out = [];
  const stack = [...(children.get(root) ?? [])];
  const seen = new Set([root]);
  while (stack.length) {
    const pid = stack.pop();
    if (pid === undefined || seen.has(pid) || pid <= 0 || pid === process.pid) continue;
    seen.add(pid);
    const row = byPid.get(pid);
    if (row) out.push(row);
    for (const child of children.get(pid) ?? []) stack.push(child);
  }
  return out;
}

function watchDescendants(file, child) {
  const seen = new Set();
  const step = async () => {
    while (child.pid && child.exitCode === null && child.signalCode === null) {
      const rows = await listProcesses();
      if (rows) {
        for (const row of descendants(child.pid, rows)) {
          const key = `${row.pid}:${row.created}`;
          if (seen.has(key)) continue;
          seen.add(key);
          appendRecord(file, { pid: row.pid, created: row.created });
        }
      }
      if (child.exitCode !== null || child.signalCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  void step();
}

function remember(file, child) {
  const pid = child.pid;
  if (!pid || pid === process.pid) return;
  appendRecord(file, { pid });
  let chain = Promise.resolve();
  const step = work => { chain = chain.then(work, work); };
  const exited = new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', () => resolve());
  });
  step(async () => {
    const created = await processCreation(pid);
    if (created) appendRecord(file, { pid, created });
  });
  void exited.then(() => step(async () => { appendRecord(file, { pid, gone: true }); }));
}

childProcess.spawn = function (...args) {
  const child = originalSpawn.apply(this, args);
  const file = process.env.DULSE_SPAWN_LEDGER;
  if (file) { remember(file, child); watchDescendants(file, child); }
  return child;
};

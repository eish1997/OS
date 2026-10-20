import { createRequire } from 'node:module';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as typeof import('node:child_process');

export function spawnLedgerPath(dataDir: string, projectId: string, runId: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(projectId) || !/^[a-zA-Z0-9-]+$/.test(runId)) return;
  const root = resolve(dataDir);
  const file = resolve(root, 'sessions', projectId, '.output', runId, 'processes.jsonl');
  if (file !== root && !file.startsWith(root + sep)) return;
  return file;
}

function processCreation(pid: number) {
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot || !Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve<string | null>(null);
  const command = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if(-not $p){exit 2}; $p.CreationDate.ToUniversalTime().ToString('o')`;
  return new Promise<string | null>(resolve => {
    childProcess.execFile(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
      if (error) { resolve(null); return; }
      const text = String(stdout).trim();
      resolve(text || null);
    });
  });
}

/** The worker preload reads this path when Pi spawns a process. */
export function installSpawnLedger(file: string) {
  process.env.DULSE_SPAWN_LEDGER = file;
}

/** Stop recorded processes whose creation time still matches. A reused PID or an unreadable identity is left running. */
export async function stopRecordedSpawnProcesses(dataDir: string, projectId: string, runId: string) {
  const file = spawnLedgerPath(dataDir, projectId, runId);
  if (!file || !existsSync(file)) return;
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !info.isFile() || info.size > 1024 * 1024) return;
  const state = new Map<number, { created?: string; gone?: boolean }>();
  for (const line of readFileSync(file, 'utf8').split(/\n/)) {
    if (!line) continue;
    let row: { pid?: unknown; created?: unknown; gone?: unknown };
    try { row = JSON.parse(line); } catch { continue; }
    if (typeof row.pid !== 'number' || !Number.isSafeInteger(row.pid) || row.pid <= 0 || row.pid === process.pid) continue;
    const current = state.get(row.pid) ?? {};
    if (row.gone === true) current.gone = true;
    if (typeof row.created === 'string' && row.created.length <= 80) current.created = row.created;
    state.set(row.pid, current);
  }
  const { taskkillPid } = await import('./owned-process.js');
  for (const [pid, current] of state) {
    if (current.gone || !current.created) continue;
    if (await processCreation(pid) !== current.created) continue;
    await taskkillPid(pid);
  }
}

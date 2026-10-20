import {execFile,type ChildProcess} from 'node:child_process';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export type KillPid = (pid: number) => Promise<boolean>;

function pidAlive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
    return code !== 'ESRCH';
  }
}

async function listProcesses(): Promise<Array<{ pid: number; ppid: number }> | null> {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) return null;
  const command = "Get-CimInstance Win32_Process | ForEach-Object { '{0},{1}' -f $_.ProcessId, $_.ParentProcessId }";
  return new Promise(resolve => {
    execFile(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) { resolve(null); return; }
      const rows: Array<{ pid: number; ppid: number }> = [];
      for (const line of String(stdout).split(/\r?\n/)) {
        const match = /^(\d+),(\d+)$/.exec(line.trim());
        if (!match) continue;
        rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
      }
      resolve(rows.length ? rows : null);
    });
  });
}

function descendantsOf(root: number, rows: Array<{ pid: number; ppid: number }>) {
  const children = new Map<number, number[]>();
  for (const row of rows) {
    const list = children.get(row.ppid);
    if (list) list.push(row.pid); else children.set(row.ppid, [row.pid]);
  }
  const out: number[] = [];
  const stack = [...(children.get(root) ?? [])];
  const seen = new Set<number>([root]);
  while (stack.length) {
    const pid = stack.pop();
    if (pid === undefined || seen.has(pid) || pid <= 0 || pid === process.pid) continue;
    seen.add(pid);
    out.push(pid);
    for (const child of children.get(pid) ?? []) stack.push(child);
  }
  return out;
}

export function isOwnedWorkerCommand(command: string) {
  return command.replaceAll('\\', '/').toLowerCase().includes('server/worker.ts');
}

/** Missing means the pid is gone. Unreadable means it is alive but the command line could not be checked. */
export async function workerProcessKind(pid: number): Promise<'missing' | 'owned' | 'other' | 'unreadable'> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return 'unreadable';
  if (!pidAlive(pid)) return 'missing';
  if (process.platform !== 'win32') return 'unreadable';
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) return 'unreadable';
  const command = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ForEach-Object { $_.CommandLine }`;
  const text = await new Promise<string | null>(resolve => {
    execFile(join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 }, (error, stdout) => resolve(error ? null : String(stdout)));
  });
  if (text === null) return pidAlive(pid) ? 'unreadable' : 'missing';
  const line = text.trim();
  if (!line) return pidAlive(pid) ? 'unreadable' : 'missing';
  return isOwnedWorkerCommand(line) ? 'owned' : 'other';
}

export async function taskkillPid(pid: number): Promise<boolean> {
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return false;
  return new Promise(resolve => execFile(join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000, maxBuffer: 65536 }, error => resolve(!error)));
}

async function confirmedGone(pids: number[]) {
  const alive = () => pids.filter(pidAlive);
  if (alive().length === 0) return true;
  await delay(100);
  return alive().length === 0;
}

/**
 * Snapshot the live tree twice before termination so a child born after the first
 * listing is still recorded, then terminate every recorded process. A root that
 * disappeared before the first snapshot does not prove its former children were cleaned up.
 * A process that appears only after the root is already gone is still not attributable.
 */
export async function terminateWindowsTree(pid: number, killPid: KillPid = taskkillPid, list: () => Promise<Array<{ pid: number; ppid: number }> | null> = listProcesses): Promise<boolean> {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return false;
  const observe = async () => {
    const rows = await list();
    if (!rows || !rows.some(row => row.pid === pid)) return null;
    return descendantsOf(pid, rows);
  };
  const first = await observe();
  if (!first) return killPid(pid);
  const watched = new Set<number>([pid, ...first]);
  if (pidAlive(pid)) {
    await delay(200);
    const second = await observe();
    if (second) for (const id of second) watched.add(id);
  }
  await killPid(pid);
  for (const id of watched) if (id !== process.pid && pidAlive(id)) await taskkillPid(id);
  if (pidAlive(pid)) {
    const third = await observe();
    if (third) for (const id of third) if (watched.add(id) && pidAlive(id)) await taskkillPid(id);
  }
  return confirmedGone([...watched]);
}

/** Only accepts the current owned ChildProcess handle, never a recovered/stored PID. */
export async function terminateOwnedProcessTree(child: ChildProcess, killPid: KillPid = taskkillPid): Promise<boolean> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return false;
  if (process.platform !== 'win32') return child.kill();
  return terminateWindowsTree(child.pid, killPid);
}

/** Probe paths may only know a live PID after the transport handle is gone. */
export async function terminateProcessTreeByPid(pid: number, killPid: KillPid = taskkillPid, list?: () => Promise<Array<{ pid: number; ppid: number }> | null>): Promise<boolean> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  if (process.platform !== 'win32') try { return process.kill(pid); } catch { return false; }
  return list ? terminateWindowsTree(pid, killPid, list) : terminateWindowsTree(pid, killPid);
}

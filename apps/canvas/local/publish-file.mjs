import { linkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve, toNamespacedPath } from 'node:path'

// Fixed script, with paths supplied as data through the child environment. No
// filename is interpolated into PowerShell or C# source. Flags deliberately omit
// REPLACE_EXISTING and COPY_ALLOWED: never overwrite or copy across volumes.
// https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
const moveScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CanvasFileMove {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool MoveFileExW(string source, string target, uint flags);
}
'@
if ([CanvasFileMove]::MoveFileExW($env:OS_CANVAS_MOVE_SOURCE, $env:OS_CANVAS_MOVE_TARGET, 8)) {
  [Console]::Write('0')
} else {
  [Console]::Write([Runtime.InteropServices.Marshal]::GetLastWin32Error())
  exit 1
}
`

export function moveWindowsNoReplace(source, target) {
  if (process.platform !== 'win32' || dirname(resolve(source)).toLowerCase() !== dirname(resolve(target)).toLowerCase()) {
    throw Object.assign(new Error('Same-directory Windows publication is unavailable'), { code: 'ENOTSUP' })
  }
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const child = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(moveScript, 'utf16le').toString('base64')], {
    windowsHide: true, timeout: 15000, encoding: 'utf8',
    env: { ...process.env, OS_CANVAS_MOVE_SOURCE: toNamespacedPath(source), OS_CANVAS_MOVE_TARGET: toNamespacedPath(target) }
  })
  if (!child.error && child.status === 0 && child.stdout.trim() === '0') return
  const code = { 80: 'EEXIST', 183: 'EEXIST', 5: 'EACCES', 112: 'ENOSPC', 17: 'EXDEV', 50: 'ENOTSUP' }[child.stdout?.trim()] ?? 'EIO'
  throw Object.assign(new Error('Windows publication was not confirmed; retry the recorded operation'), { code })
}

export function publishFileNoReplace(source, target) {
  try { linkSync(source, target) }
  catch (error) {
    if (process.platform !== 'win32' || !['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EPERM'].includes(error.code)) throw error
    moveWindowsNoReplace(source, target)
  }
}

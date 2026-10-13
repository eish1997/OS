import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AppError } from './store.js';
import type { StorageCapacity } from './storage.js';

/** Credentials never enter SQLite entities, native sessions, diagnostics or backups. */
export class PrivateFiles {
  readonly directory: string;
  private protected = false;
  constructor(dataDir: string, private readonly capacity: StorageCapacity) {
    this.directory = join(dataDir, 'private-model');
  }
  prepare() {
    if (existsSync(this.directory) && (!lstatSync(this.directory).isDirectory() || lstatSync(this.directory).isSymbolicLink())) throw new AppError(503, '模型凭据目录不安全');
    if (this.protected) return;
    this.capacity.write(undefined, 4096, () => {
      if (!existsSync(this.directory)) mkdirSync(this.directory, { mode: 0o700 });
      if (process.platform === 'win32') {
        // Fixed script; path arrives via environment, never interpolated as PowerShell code.
        const script = "$ErrorActionPreference='Stop'; $p=$env:WB_PRIVATE_PATH; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $info=[System.IO.DirectoryInfo]::new($p); if($info.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Owner).GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'Unexpected credential owner'}; $acl=$info.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access); $acl.SetAccessRuleProtection($true,$false); foreach($entry in @($acl.GetAccessRules($true,$false,[System.Security.Principal.SecurityIdentifier]))){$acl.RemoveAccessRuleSpecific($entry)}; $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule); $info.SetAccessControl($acl)";
        const exe = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const result = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15_000, env: { SystemRoot: process.env.SystemRoot, WB_PRIVATE_PATH: this.directory }, stdio: 'ignore' });
        if (result.status !== 0) throw new AppError(503, '无法保护模型凭据目录；尚未保存凭据');
      } else chmodSync(this.directory, 0o700);
      this.protected = true;
    }, true);
  }
  read<T>(name: string): T | undefined {
    const path = this.path(name);
    if (!existsSync(path)) return;
    this.prepare();
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 64_000) throw new Error();
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch { throw new AppError(503, '模型凭据记录不可读；请先诊断，不自动覆盖'); }
  }
  save(name: string, value: unknown) {
    this.prepare(); const path = this.path(name); const content = JSON.stringify(value);
    this.capacity.write(undefined, Buffer.byteLength(content), () => {
      const temporary = this.path(`${name}.${randomUUID()}.next`);
      try { writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 }); renameSync(temporary, path); }
      finally { if (existsSync(temporary)) unlinkSync(temporary); }
    }, true);
  }
  remove(name: string) { this.capacity.exclusive(() => { const path = this.path(name); if (existsSync(path)) { if (lstatSync(path).isSymbolicLink()) throw new AppError(503, '模型凭据路径不安全'); unlinkSync(path); } }); }
  private path(name: string) { if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new AppError(400, '私有记录名称无效'); return join(this.directory, name); }
}

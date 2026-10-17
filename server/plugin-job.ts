import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

/** Must finish before npm/git can spawn. Failure refuses the installation. */
export async function protectPluginProcessTree() {
  if (process.platform !== 'win32') return;
  await new Promise<void>((resolveReady, reject) => {
    const guardian = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/plugin-job.ps1'), '-WorkerId', String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let ready = false;
    const timeout = setTimeout(() => { guardian.kill(); reject(new Error('插件进程保护启动超时')); }, 15000);
    guardian.stderr.on('data', () => {});
    let output = '';
    guardian.stdout.on('data', chunk => {
      output += chunk.toString();
      if (!ready && output.includes('ready')) {
        ready = true; clearTimeout(timeout);
        // The guardian must outlive us, but must not prevent our natural exit.
        guardian.unref(); guardian.stdout.destroy(); guardian.stderr.destroy();
        resolveReady();
      }
    });
    guardian.once('error', () => { clearTimeout(timeout); reject(new Error('无法启动插件进程保护')); });
    guardian.once('exit', () => { clearTimeout(timeout); if (!ready) reject(new Error('无法建立插件进程保护，未执行安装')); });
  });
}

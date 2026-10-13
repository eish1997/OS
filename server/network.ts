import { setGlobalProxyFromEnv } from 'node:http';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

type SystemProxy = { enabled: boolean; server?: string; pac?: boolean };
type ProxyEnv = { HTTP_PROXY: string; HTTPS_PROXY: string; NO_PROXY: string };
let selected: ProxyEnv | undefined;
/** Reuse deployment/user network configuration; never change the Windows settings. */
export function selectProxy(env: NodeJS.ProcessEnv, system?: SystemProxy): ProxyEnv {
  const mode = env.WORKBENCH_PROXY_MODE || 'auto';
  if (!['auto', 'environment', 'direct'].includes(mode)) throw new Error('Invalid WORKBENCH_PROXY_MODE');
  let http = env.http_proxy ?? env.HTTP_PROXY ?? '';
  let https = env.https_proxy ?? env.HTTPS_PROXY ?? '';
  if (mode === 'direct') { http = ''; https = ''; }
  else if (mode === 'auto' && !http && !https && system?.enabled && system.server) {
    const entries = system.server.split(';').map(v => v.trim()).filter(Boolean);
    const plain = entries.length === 1 && !entries[0].includes('=') ? entries[0] : '';
    const address = (name: string) => plain || entries.find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
    http = address('http'); https = address('https') || http;
    http = http && !http.includes('://') ? 'http://' + http : http;
    https = https && !https.includes('://') ? 'http://' + https : https;
  }
  for (const value of [http, https]) if (value) {
    let url: URL; try { url = new URL(value); } catch { throw new Error('Invalid proxy URL; credentials omitted'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.search || url.hash || url.pathname !== '/') throw new Error('Proxy requires an HTTP(S) URL; credentials omitted');
  }
  const bypass = env.no_proxy ?? env.NO_PROXY ?? '';
  return { HTTP_PROXY: http, HTTPS_PROXY: https, NO_PROXY: [bypass, 'localhost', '127.0.0.1', '::1', '[::1]'].filter(Boolean).join(',') };
}
function windowsProxy(): SystemProxy | undefined {
  const script = "$p=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction SilentlyContinue; @{enabled=[bool]$p.ProxyEnable;server=[string]$p.ProxyServer;pac=[bool]$p.AutoConfigURL}|ConvertTo-Json -Compress";
  const result = spawnSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 5000, maxBuffer: 16_000, env: { SystemRoot: process.env.SystemRoot }, encoding: 'utf8' });
  if (result.status !== 0) return;
  try { return JSON.parse(result.stdout.replace(/^\uFEFF/, '')) as SystemProxy; } catch { return; }
}
export function initializeNetwork() {
  if (selected) return;
  const explicit = process.env.http_proxy || process.env.HTTP_PROXY || process.env.https_proxy || process.env.HTTPS_PROXY;
  selected = selectProxy(process.env, process.platform === 'win32' && !explicit && (!process.env.WORKBENCH_PROXY_MODE || process.env.WORKBENCH_PROXY_MODE === 'auto') ? windowsProxy() : undefined);
  if (typeof setGlobalProxyFromEnv !== 'function') throw new Error('Network proxy support requires Node.js 24.14+');
  setGlobalProxyFromEnv(selected);
}
/** Only the chosen route reaches the restricted worker, without inherited global credentials. */
export function workerNetworkEnv(): NodeJS.ProcessEnv {
  return selected ? { ...selected, NODE_USE_ENV_PROXY: '1', WORKBENCH_PROXY_MODE: 'environment' } : { WORKBENCH_PROXY_MODE: 'environment' };
}

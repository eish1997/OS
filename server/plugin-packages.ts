import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DefaultPackageManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import type { PluginPackage, PluginResourceKind } from '../shared/plugins.js';
import { AppError } from './store.js';

export function pluginSource(input: unknown) {
  if (typeof input !== 'string' || !input.trim() || input.length > 2000 || /[\x00-\x1f]/.test(input)) throw new AppError(400, '插件来源无效');
  let source = input.trim();
  if (/^npm(?:\s|$)/i.test(source)) {
    const command = source.match(/^npm\s+(?:install|i)\s+(\S+)$/i);
    if (!command || command[1].startsWith('-') || /[;&|`$<>()]/.test(command[1])) throw new AppError(400, '请填写 npm install 包名 或 npm:包名@版本；一次只安装一个包，不含额外命令或参数');
    // Extract a package spec only. Never execute the pasted command as a shell string.
    source = `npm:${command[1]}`;
  }
  if (source.startsWith('git://')) source = `git:${source}`;
  let identity: string; let kind: PluginPackage['kind'];
  if (source.startsWith('npm:')) {
    const match = source.match(/^npm:((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:@([a-z0-9*^~<>=|.+_-]+))?$/i);
    if (!match) throw new AppError(400, 'npm 来源应为 npm:包名 或 npm:包名@版本');
    kind = 'npm'; identity = `npm:${match[1].toLowerCase()}`;
  } else if (/^(?:git:|https?:\/\/|ssh:\/\/)/.test(source)) {
    kind = 'git';
    let value = source.replace(/^git:/, '');
    if (!value.includes('://') && !value.startsWith('git@')) value = `https://${value}`;
    // Remove the ref suffix, preserving the SSH user@host portion.
    const slash = value.lastIndexOf('/'); const ref = value.lastIndexOf('@');
    if (ref > slash) value = value.slice(0, ref);
    value = value.replace(/^git@([^:]+):/, 'ssh://git@$1/');
    let url: URL; try { url = new URL(value); } catch { throw new AppError(400, 'Git 地址无效'); }
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || url.password || url.search || url.hash || (url.username && url.username !== 'git')) throw new AppError(400, 'Git 地址不能包含密码、令牌或查询参数');
    identity = `git:${url.host.toLowerCase()}${url.pathname.replace(/\.git$/, '').replace(/\/$/, '')}`;
  } else {
    if (!isAbsolute(source)) throw new AppError(400, '请输入 npm:包名、npm install 包名、Git 地址或服务端本地绝对路径');
    kind = 'local'; identity = `local:${process.platform === 'win32' ? resolve(source).toLowerCase() : resolve(source)}`;
  }
  return { source, identity, kind, id: createHash('sha256').update(identity).digest('hex').slice(0, 24) };
}

/** Pi 1.0.3 stores Git checkouts by hostname/path, without port or ref. */
export function assertPluginDestination(source: string, packages: PluginPackage[], agentDir: string) {
  const parsed = pluginSource(source);
  const destination = (item: ReturnType<typeof pluginSource>) => {
    if (item.kind === 'local') return resolve(item.source);
    if (item.kind === 'npm') return join(agentDir, 'npm', 'node_modules', item.identity.slice(4));
    const url = new URL(`https://${item.identity.slice(4)}`);
    return resolve(agentDir, 'git', url.hostname, url.pathname.replace(/^\/+/, ''));
  };
  const overlaps = (left: string, right: string) => {
    const path = relative(left, right);
    return !path || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
  };
  const target = destination(parsed);
  for (const pkg of packages) {
    if (pkg.id === parsed.id) continue;
    const other = destination(pluginSource(pkg.source));
    if (overlaps(target, other) || overlaps(other, target)) throw new AppError(409, `插件安装目录与 ${pkg.name} 重叠，请使用独立来源目录`);
  }
}

/** Includes source and dependency bytes; bounded, no traversal through directory links. */
export function pluginFingerprint(root: string): string {
  const hash = createHash('sha256'); let bytes = 0; let count = 0;
  const walk = (path: string, key: string) => {
    const stat = lstatSync(path);
    if (++count > 100000 || (bytes += stat.size) > 512 * 1024 ** 2) throw new Error('插件内容超过校验上限（512 MiB / 100000 项）');
    if (stat.isSymbolicLink()) { hash.update(`${key}:link:${realpathSync(path)}`); throw new Error('插件内容含符号链接，当前无法保证内容校验'); }
    if (stat.isDirectory()) { for (const name of readdirSync(path).sort()) if (name !== '.git') walk(join(path, name), `${key}/${name}`); }
    else if (stat.isFile()) hash.update(key).update(readFileSync(path));
  };
  walk(root, ''); return hash.digest('hex');
}

export function pluginEnvironmentFingerprint(agentDir: string) {
  const hash = createHash('sha256');
  for (const name of ['npm', 'git']) { const path = join(agentDir, name); if (existsSync(path)) hash.update(name).update(pluginFingerprint(path)); }
  return hash.digest('hex');
}

export async function inspectPlugin(source: string, agentDir: string): Promise<PluginPackage> {
  const parsed = pluginSource(source);
  const manager = new DefaultPackageManager({ cwd: agentDir, agentDir, settingsManager: SettingsManager.inMemory({ packages: [parsed.source] }) });
  // Do not accept Pi's legacy fallback into the user's global npm installation.
  const root = parsed.kind === 'local' ? resolve(parsed.source) : parsed.kind === 'npm' ? join(agentDir, 'npm', 'node_modules', parsed.identity.slice(4)) : manager.getInstalledPath(parsed.source, 'user');
  if (!root || !existsSync(root)) throw new Error('插件文件缺失，请重新安装或重新定位服务端本地路径');
  const resolved = await manager.resolve(async () => 'error');
  const resources = (['extensions', 'skills', 'prompts', 'themes'] as PluginResourceKind[]).flatMap(kind => resolved[kind]
    .filter(r => r.metadata.origin === 'package' && r.metadata.source === parsed.source && r.enabled)
    .map(r => ({ id: createHash('sha256').update(`${kind}:${r.path}`).digest('hex').slice(0, 24), kind, path: r.path, enabled: kind !== 'themes' })));
  const manifest = lstatSync(root).isDirectory() && existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) : {};
  let commit: string | undefined;
  if (parsed.kind === 'git') commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
  const version = typeof manifest.version === 'string' ? manifest.version : undefined;
  const gitRefAt = parsed.source.lastIndexOf('@');
  const gitBase = gitRefAt > parsed.source.lastIndexOf('/') ? parsed.source.slice(0, gitRefAt) : parsed.source;
  const lockedSource = parsed.kind === 'npm' && version ? `${parsed.identity}@${version}` : parsed.kind === 'git' && commit ? `${gitBase}@${commit}` : parsed.source;
  return { ...parsed, name: typeof manifest.name === 'string' ? manifest.name : basename(root), version, commit, lockedSource, root, enabled: false, resources, fingerprint: pluginFingerprint(root), installedAt: new Date().toISOString() };
}

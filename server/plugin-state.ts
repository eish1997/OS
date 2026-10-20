import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PluginConfiguration, PluginOperation, PluginPackage, PluginRunManifest, PluginDiscovery } from '../shared/plugins.js';
import { Store, AppError } from './store.js';
import { pluginEnvironmentFingerprint, pluginFingerprint, pluginSource } from './plugin-packages.js';

const activePhases = new Set(['queued', 'waiting_for_environment', 'preparing', 'applying', 'committing']);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** All file mutations go through the coordinator; this is the single configuration authority. */
export class PluginState {
  constructor(readonly store: Store) {}
  configuration(): PluginConfiguration {
    return this.store.list<PluginConfiguration>('plugin_config')[0] ?? this.store.create<PluginConfiguration>('plugin_config', {
      id: 'plugin-config-v1', schemaVersion: 1, environmentRevision: 0, packages: [], health: 'ready'
    });
  }
  operations() { return this.store.list<PluginOperation>('plugin_operation'); }
  snapshot() {
    const config = this.configuration();
    const loads = this.store.list<import('../shared/contracts.js').Entity & NonNullable<PluginPackage['lastLoad']> & { packageId: string }>('plugin_load');
    return { configuration: { ...config, packages: config.packages.map(p => ({ ...p, installationState: p.installationState === 'missing' || !existsSync(p.root) ? 'missing' as const : 'ready' as const, lastLoad: p.installationState === 'missing' ? undefined : loads.filter(l => l.packageId === p.id).sort((a, b) => b.at.localeCompare(a.at))[0] })) }, operations: this.operations(), discoveries: this.store.list<PluginDiscovery>('plugin_discovery').slice(-10).reverse() };
  }
  recordLoad(manifest: PluginRunManifest, runId: string, projectId: string, error?: string) {
    this.store.transaction(() => {
      for (const pkg of manifest.packages) this.store.create<import('../shared/contracts.js').Entity & NonNullable<PluginPackage['lastLoad']> & { packageId: string }>('plugin_load', { packageId: pkg.id, runId, projectId, at: new Date().toISOString(), environmentRevision: manifest.environmentRevision, error });
      this.store.event('plugins.loaded', { runId, error }, { runId, projectId });
    });
  }
  pending() { return this.operations().filter(o => activePhases.has(o.phase)); }
  private revision(expected: number) {
    const config = this.configuration();
    if (!Number.isSafeInteger(expected) || config.revision !== expected) throw new AppError(409, '插件配置已更新，请刷新后重试');
    return config;
  }
  configure(expected: number, id: string, enabled: boolean, resourceIds?: string[]) {
    return this.store.transaction(() => {
      const config = this.revision(expected);
      if (this.pending().length) throw new AppError(409, '有插件文件操作未完成，请等待操作结束');
      if (config.health !== 'ready') throw new AppError(409, '插件环境需要修复');
      const pkg = config.packages.find(p => p.id === id);
      if (!pkg) throw new AppError(404, '插件不存在');
      if (enabled && (pkg.installationState === 'missing' || !existsSync(pkg.root))) throw new AppError(409, '插件文件缺失，请重新安装');
      if (resourceIds && resourceIds.some(key => !pkg.resources.some(r => r.id === key && r.kind !== 'themes'))) throw new AppError(400, '资源不存在或当前网页不支持此资源');
      const updated = { ...pkg, enabled, resources: pkg.resources.map(r => ({ ...r, enabled: r.kind !== 'themes' && (resourceIds ? resourceIds.includes(r.id) : r.enabled) })) };
      const next = this.store.update<PluginConfiguration>('plugin_config', config.id, config.revision, { packages: config.packages.map(p => p.id === id ? updated : p) });
      this.store.event('plugins.configured', { revision: next.revision }); return next;
    });
  }
  enqueue(input: { action: PluginOperation['action']; source: string; revision: number; commandId: string; trusted: boolean }) {
    if (!['install', 'update', 'remove', 'repair'].includes(input.action)) throw new AppError(400, '插件操作无效');
    if (typeof input.commandId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(input.commandId)) throw new AppError(400, '操作幂等标识无效');
    const parsed = pluginSource(input.source);
    return this.store.command(`plugin:${input.commandId}`, digest(input), () => {
      const config = this.revision(input.revision);
      if (input.action !== 'remove' && input.trusted !== true) throw new AppError(400, '请确认来源可信；安装可能执行代码');
      if (this.pending().length) throw new AppError(409, '已有插件操作等待或执行中');
      const existing = config.packages.find(p => p.id === parsed.id);
      if (input.action === 'install' && existing) throw new AppError(409, '插件已安装，请使用更新或修复');
      if (input.action !== 'install' && !existing && input.action !== 'repair') throw new AppError(404, '插件不存在');
      if (config.health !== 'ready' && !['repair', 'remove'].includes(input.action)) throw new AppError(409, '插件环境需要先修复');
      const operation = this.store.create<PluginOperation>('plugin_operation', { action: input.action, source: parsed.source, packageId: parsed.id, expectedRevision: config.revision, phase: 'queued', progress: '等待插件环境', });
      this.store.event('plugins.operation', { operationId: operation.id, phase: operation.phase }); return operation;
    });
  }
  phase(id: string, phase: PluginOperation['phase'], progress: string, extra: Partial<PluginOperation> = {}) {
    const op = this.store.get<PluginOperation>('plugin_operation', id);
    const updated = this.store.update<PluginOperation>('plugin_operation', id, op.revision, { ...extra, phase, progress });
    this.store.event('plugins.operation', { operationId: id, phase }); return updated;
  }
  commit(id: string, inspected: PluginPackage[], environmentFingerprint?: string) {
    return this.store.transaction(() => {
      const op = this.store.get<PluginOperation>('plugin_operation', id);
      if (op.phase !== 'committing') throw new AppError(409, '插件操作尚不能提交');
      const config = this.revision(op.expectedRevision);
      const packages = inspected.map(pkg => {
        const previous = config.packages.find(p => p.id === pkg.id);
        return { ...pkg, enabled: previous?.enabled ?? false, resources: pkg.resources.map(r => ({ ...r, enabled: r.kind !== 'themes' && (previous?.resources.find(old => old.id === r.id)?.enabled ?? r.enabled) })) };
      });
      const next = this.store.update<PluginConfiguration>('plugin_config', config.id, config.revision, { packages, environmentRevision: config.environmentRevision + 1, environmentFingerprint, health: 'ready', error: undefined });
      this.phase(id, 'completed', '操作完成', { endedAt: new Date().toISOString() }); return next;
    });
  }
  uncertain(id: string, error: string) {
    this.store.transaction(() => {
      const config = this.configuration();
      this.store.update<PluginConfiguration>('plugin_config', config.id, config.revision, { health: 'reconcile_required', error });
      this.phase(id, 'reconcile_required', '环境需要核对或修复', { error, endedAt: new Date().toISOString() });
    });
  }
  /** Must be called while holding the environment read lease. Does not install anything. */
  manifest(): PluginRunManifest {
    const config = this.configuration();
    if (config.health !== 'ready') throw new AppError(409, '插件环境需要修复，未启动执行');
    const packages = config.packages.filter(p => p.enabled).map(p => {
      const fingerprint = pluginFingerprint(p.root);
      if (p.kind !== 'local' && fingerprint !== p.fingerprint) throw new AppError(409, `插件文件已改变，请修复：${p.name}`);
      return { id: p.id, source: p.source, fingerprint, version: p.version, commit: p.commit };
    });
    const resources = config.packages.filter(p => p.enabled).flatMap(p => p.resources.filter(r => r.enabled && r.kind !== 'themes'));
    const environmentFingerprint = config.packages.some(p => p.enabled && p.kind !== 'local') ? pluginEnvironmentFingerprint(join(dirname(this.store.path), 'plugins')) : undefined;
    if (environmentFingerprint && environmentFingerprint !== config.environmentFingerprint) throw new AppError(409, '插件共享依赖已变化，请先修复环境');
    return { configurationRevision: config.revision, environmentRevision: config.environmentRevision, packages, resources, environmentFingerprint, signature: digest({ packages, resources, environmentFingerprint }) };
  }
  assertCompatible(previous: PluginRunManifest | undefined, current: PluginRunManifest) {
    if (previous ? previous.signature !== current.signature : current.packages.length > 0) throw new AppError(409, '插件环境已变化，不能直接重试或接续旧执行；请按当前配置开始新话题');
  }
}

/** Writer preference; acquired synchronously before scheduling/forking to avoid launch races. */
export class PluginEnvironmentGate {
  private readers = new Set<string>();
  private writer?: string;
  private waitingWriter?: string;
  acquireRead(runId: string): boolean {
    if (this.writer || this.waitingWriter) return false;
    this.readers.add(runId); return true;
  }
  releaseRead(runId: string) { this.readers.delete(runId); }
  requestWrite(operationId: string): boolean {
    if (this.writer) return this.writer === operationId;
    if (this.waitingWriter && this.waitingWriter !== operationId) return false;
    this.waitingWriter = operationId;
    if (this.readers.size) return false;
    this.writer = operationId; this.waitingWriter = undefined; return true;
  }
  releaseWrite(operationId: string) {
    if (this.writer === operationId) this.writer = undefined;
    if (this.waitingWriter === operationId) this.waitingWriter = undefined;
  }
  status() { return { runs: [...this.readers], writer: this.writer, waitingWriter: this.waitingWriter }; }
}

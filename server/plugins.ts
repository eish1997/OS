import { fork, execFile, type ChildProcess } from 'node:child_process';
import { dirname, delimiter, join, resolve, relative, isAbsolute } from 'node:path';
import { mkdirSync, existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { PluginOperation, PluginPackage } from '../shared/plugins.js';
import { PluginEnvironmentGate, PluginState } from './plugin-state.js';
import { originalProcessGone, processBirth, type ProcessBirth } from './process-birth.js';
import { workerNetworkEnv } from './network.js';
import type { Store } from './store.js';
import { assertPluginDestination } from './plugin-packages.js';
import { pluginOutputDiagnostic } from './plugin-diagnostics.js';

export class Plugins {
  readonly state: PluginState;
  readonly gate = new PluginEnvironmentGate();
  readonly agentDir: string;
  private timer?: ReturnType<typeof setInterval>;
  private active?: { child: ChildProcess; done: Promise<void> };
  private stopped = false;
  private readonly owner = randomUUID();
  get mutating() { return Boolean(this.active); }
  constructor(store: Store, private readonly blockers: () => boolean = () => false, private readonly leaseOwner: () => string = () => this.owner, private readonly options: { registry?: string; timeoutMs?: number } = {}) {
    this.state = new PluginState(store); this.agentDir = join(dirname(store.path), 'plugins');
    this.recoverInterrupted();
  }
  private recoverInterrupted() {
    const interrupted = this.state.pending().filter(op => !['queued', 'waiting_for_environment'].includes(op.phase));
    if (!interrupted.length) return;
    // Another live coordinator may own these operations. Constructor execution
    // alone is not evidence of a crash; wait for the durable owner's lease.
    // Use our own owner here: the scheduler callback is not initialized yet.
    if (!this.state.store.lease('scheduler', this.owner, 30000)) return;
    try {
      for (const op of interrupted) this.state.uncertain(op.id, '服务在插件操作中中断；需核对进程与文件后修复');
    } finally { this.state.store.release('scheduler', this.owner); }
  }
  start() {
    if (this.timer || this.stopped) return;
    const poll = () => {
      try { this.tick(); }
      catch { console.error('Plugin coordinator polling failed; persisted operation will be checked again'); }
    };
    this.timer = setInterval(poll, 750); this.timer.unref(); poll();
  }
  private cleanupCache() {
    const cache = join(this.agentDir, 'cache'); if (!existsSync(cache)) return;
    if (lstatSync(cache).isSymbolicLink() || lstatSync(this.agentDir).isSymbolicLink()) throw new Error('插件缓存路径异常，未清理');
    const child = relative(realpathSync(this.agentDir), realpathSync(cache));
    if (!child || child.startsWith('..') || isAbsolute(child) || child !== 'cache') throw new Error('插件缓存不在托管目录内，未清理');
    rmSync(cache, { recursive: true, force: true });
  }
  tick() {
    if (this.stopped || this.active) return;
    this.recoverInterrupted();
    const op = this.state.pending().find(o => ['queued', 'waiting_for_environment'].includes(o.phase)); if (!op) return;
    if (!this.gate.requestWrite(op.id) || this.blockers()) {
      if (op.phase !== 'waiting_for_environment') this.state.phase(op.id, 'waiting_for_environment', '等待现有执行或维护结束');
      return;
    }
    // Unknown former worker identity must never be treated as a released environment.
    for (const previous of this.state.operations().filter(o => o.phase === 'reconcile_required' && o.workerPid)) {
      const birth = previous.workerBirth ? JSON.parse(previous.workerBirth) as ProcessBirth : undefined;
      if (!originalProcessGone(previous.workerPid!, birth)) {
        this.state.phase(op.id, 'failed', '旧插件进程仍存在或身份无法确认', { error: '先核对旧插件进程，再重新提交修复操作' });
        this.gate.releaseWrite(op.id); return;
      }
    }
    const config = this.state.configuration();
    if (config.revision !== op.expectedRevision) { this.state.phase(op.id, 'failed', '配置已变化，请重新提交'); this.gate.releaseWrite(op.id); return; }
    try {
      // Share the scheduler's durable lease. A second service cannot mutate this environment
      // while the owning scheduler is executing, even if its in-memory gate is different.
      if (!this.state.store.lease('scheduler', this.leaseOwner(), 30000)) return;
      try { assertPluginDestination(op.source, config.packages, this.agentDir); }
      catch (failure) {
        this.state.phase(op.id, 'failed', '插件目录冲突，未执行文件操作', { error: failure instanceof Error ? failure.message : '插件目录冲突' });
        this.state.store.release('scheduler', this.leaseOwner()); this.gate.releaseWrite(op.id); return;
      }
      this.cleanupCache();
      this.state.store.capacity?.assert('plugins', 16 * 1024 ** 2);
      mkdirSync(this.agentDir, { recursive: true });
      this.state.phase(op.id, 'preparing', '准备安装环境', { startedAt: new Date().toISOString() });
      const env: NodeJS.ProcessEnv = {
        PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter), SystemRoot: process.env.SystemRoot,
        ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, ProgramFiles: process.env.ProgramFiles,
        TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: this.agentDir, USERPROFILE: this.agentDir,
        GIT_TERMINAL_PROMPT: '0', CI: '1', NO_COLOR: '1', npm_config_cache: join(this.agentDir, 'cache'), ...workerNetworkEnv()
      };
      if (this.options.registry) env.npm_config_registry = this.options.registry;
      env.npm_config_audit = 'false'; env.npm_config_fund = 'false'; env.npm_config_update_notifier = 'false';
      env.npm_config_fetch_retries = '1'; env.npm_config_fetch_retry_mintimeout = '1000'; env.npm_config_fetch_retry_maxtimeout = '2000';
      const child = fork(resolve('server/plugin-worker.ts'), [], { execPath: process.execPath, execArgv: ['--import', 'tsx'], env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      let result: PluginPackage[] | undefined; let error: string | undefined; let environmentFingerprint: string | undefined;
      let unchanged = false;
      let diagnostic: string | undefined; let diagnosticTail = '';
      const timeout = setTimeout(() => { error = '插件操作超时，需要核对环境'; void this.killTree(child); }, this.options.timeoutMs ?? 180000);
      const capacityMonitor = setInterval(() => {
        try { if (!this.state.store.lease('scheduler', this.leaseOwner(), 30000)) throw new Error('安装租约已丢失'); this.state.store.capacity?.assert('plugins', 0); }
        catch { error = '插件安装超出存储容量或无法测量，需要清理和核对环境'; void this.killTree(child); }
      }, 1000);
      child.stdout?.on('data', () => {});
      child.stderr?.on('data', chunk => {
        diagnosticTail = (diagnosticTail + chunk.toString()).slice(-4096);
        diagnostic = pluginOutputDiagnostic(diagnosticTail) ?? diagnostic;
      });
      const done = new Promise<void>(resolveDone => {
        child.on('message', (message: { type: string; packages?: PluginPackage[]; environmentFingerprint?: string; error?: string; action?: string; phase?: string; unchanged?: boolean }) => {
          if (message.type === 'result') { result = message.packages; environmentFingerprint = message.environmentFingerprint; }
          if (message.type === 'error') { error = message.error || '插件操作失败'; unchanged = message.unchanged === true; }
          if (message.type === 'progress') {
            try { this.state.phase(op.id, 'applying', `插件文件操作：${message.action ?? ''} / ${message.phase ?? ''}`); }
            catch { error = '插件进度保存失败'; void this.killTree(child); }
          }
        });
        child.on('error', () => { error = '插件管理进程无法启动'; });
        child.once('close', () => {
          clearTimeout(timeout); clearInterval(capacityMonitor);
          if (error && diagnostic) error = `${diagnostic}；${error}`;
          diagnosticTail = '';
          try {
            this.cleanupCache();
            if (error && unchanged) this.state.phase(op.id, 'failed', error, { error, endedAt: new Date().toISOString() });
            else if (!result || error) this.state.uncertain(op.id, error || '插件进程退出但未返回完整结果');
            else { this.state.phase(op.id, 'committing', '校验完成，保存配置'); this.state.commit(op.id, result, environmentFingerprint); }
          } catch (failure) {
            // If persistence itself is unavailable, leave the last durable nonterminal
            // phase intact: it prevents new runs and restart recovery quarantines it.
            try { this.state.uncertain(op.id, failure instanceof Error ? failure.message : '插件配置提交失败'); }
            catch { console.error('Plugin recovery state could not be saved; operation remains pending'); }
          } finally {
            try { this.state.store.release('scheduler', this.leaseOwner()); }
            catch { console.error('Plugin scheduler lease release failed; waiting for lease expiry'); }
            this.gate.releaseWrite(op.id); this.active = undefined; resolveDone();
          }
        });
      });
      this.active = { child, done };
      // Own the child and install exit handlers before any fallible persistence.
      // A failure here must terminate and reap it before releasing the environment.
      try {
        const birth = child.pid ? processBirth(child.pid) : undefined;
        this.state.phase(op.id, 'applying', '正在处理插件文件', { workerPid: child.pid, workerBirth: birth ? JSON.stringify(birth) : undefined });
        child.send({ operation: op, agentDir: this.agentDir, packages: config.packages }, sendError => {
          if (sendError) { error = '插件操作发送失败'; void this.killTree(child); }
        });
      } catch {
        error = '插件操作启动状态保存失败'; void this.killTree(child);
      }
    } catch (error) {
      try { this.state.uncertain(op.id, error instanceof Error ? error.message : '插件操作准备失败'); }
      finally {
        try { this.state.store.release('scheduler', this.leaseOwner()); }
        finally { this.gate.releaseWrite(op.id); }
      }
    }
  }
  private async killTree(child: ChildProcess) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') await new Promise<void>(done => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => done()));
    else try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
  async stop() {
    this.stopped = true; clearInterval(this.timer);
    const active = this.active; if (active) { await this.killTree(active.child); await active.done; }
  }
}

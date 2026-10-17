import { isNativePiTool } from '../shared/pi-tools.js';
import { fork, type ChildProcess } from 'node:child_process';
import { workerNetworkEnv } from './network.js';
import { randomUUID } from 'node:crypto';
import { join, resolve, dirname, delimiter } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { Run, Task, LocalNode, Asset, ModelUsage, SessionBinding, Operation } from '../shared/contracts.js';
import type { ModelAccess } from './model-access.js';
import { Service } from './service.js';
import { config, modelConfigured } from './config.js';
import { continuationFor } from './native-session.js';
import type { Plugins } from './plugins.js';
import type { PluginDiscovery } from '../shared/plugins.js';
export class Scheduler {
  readonly owner = randomUUID(); private timer?: ReturnType<typeof setInterval>;
  private children = new Map<string, ChildProcess>(); private ticking = false;
  constructor(private service: Service, private reportFailure = () => console.error('Scheduler: execution state update failed'), private modelAccess?: ModelAccess, private plugins?: Plugins) {}
  pluginMaintenanceBlocked() { return this.ticking || this.children.size > 0 || this.service.store.list<Run>('run').some(r => r.status === 'running' || (r.status === 'interrupted' && !r.error?.includes('已对账'))); }
  start() { this.timer = setInterval(() => this.tick(), 750); this.tick(); }
  async withIdleMaintenance(action: (owner: string, signal: AbortSignal) => Promise<void>): Promise<boolean> {
    if (this.plugins && (this.plugins.state.pending().length || this.plugins.gate.status().writer)) return false;
    if (this.ticking || this.children.size) return false;
    const {store}=this.service;
    if (store.list<Run>('run').some(r=>['running','queued','waiting_node','waiting_user'].includes(r.status)||(r.status==='interrupted'&&!r.error?.includes('已对账')))) return false;
    if (store.list<Operation>('operation').some(o=>['started','unknown'].includes(o.state))) return false;
    if(!store.lease('scheduler',this.owner,120000))return false;
    this.ticking=true;
    const controller=new AbortController();
    const renewal=setInterval(()=>{try{if(!store.lease('scheduler',this.owner,120000))controller.abort();}catch{controller.abort();}},20000);
    renewal.unref();
    // SQLite captures the database atomically and asset versions are immutable.
    // Pause execution launches, not browser edits, throughout background copying.
    try{await action(this.owner,controller.signal);if(controller.signal.aborted)throw new Error('Maintenance lease lost');return true;}
    finally{clearInterval(renewal);try{store.release('scheduler',this.owner);}finally{this.ticking=false;}}
  }
  tick() {
    if (this.plugins?.mutating) return;
    if (this.ticking) return; this.ticking = true;
    try {
      const { store } = this.service;
      if (!store.lease('scheduler', this.owner, 5000)) return;
      let runs = store.list<Run>('run');
      for (const run of runs.filter(r => r.status === 'running')) {
        const child = this.children.get(run.id);
        if (child) {
          let current=run;
          if(!run.timedOutAt&&Date.now()-Date.parse(run.startedAt!)>=run.policy.timeoutMs) {
            current=store.update<Run>('run',run.id,run.revision,{timedOutAt:new Date().toISOString()});store.event('run.timeout_requested',{}, {projectId:run.projectId,runId:run.id});
          }
          if(current.cancelRequested || current.timedOutAt) {
            if(child.connected)child.send({type:'cancel'});
            const requestedAt=Date.parse(current.timedOutAt || current.cancelRequestedAt || current.startedAt!);
            if(Date.now()-requestedAt>=5000){child.kill();this.finish(run.id,false,current.timedOutAt?'execution_timeout':undefined);continue;}
          }
          store.update<Run>('run',run.id,current.revision,{leaseUntil:Date.now()+10_000});
        } else if ((run.leaseUntil ?? 0) < Date.now()) {
          // No automatic retry: persisted PID is not proof that the process is gone.
          this.service.transition(run.id, 'interrupted', { endedAt: new Date().toISOString(), error: '执行失联；需要核对进程与产物后对账' });
          this.service.reconcileInterruptedOperations(run.id);
        }
      }
      runs = store.list<Run>('run');
      if (runs.some(r => r.status === 'running' || (r.status === 'interrupted' && !r.error?.includes('已对账')))) return;
      if(this.children.size)return; // Wait for the prior owned process to exit, including after a terminal receipt.
      for (const run of runs.filter(r => ['queued', 'waiting_node', 'waiting_user'].includes(r.status))) {
        if (run.mode === 'pi' && !(this.modelAccess ? this.modelAccess.matches(run.policy) : modelConfigured())) { if (run.status === 'queued') this.service.transition(run.id, 'waiting_user', { error: '等待原模型连接及用量许可；不会自动换账户或付费API' }); continue; }
        if (run.mode === 'pi' && run.status === 'waiting_user') { this.service.transition(run.id, 'queued'); continue; }
        if (run.mode === 'node') {
          const node = store.list<LocalNode>('node').find(n => n.id === run.nodeId && !n.revoked && n.projectIds.includes(run.projectId) && n.lastSeen > Date.now() - 12_000);
          if (!node) { if (run.status === 'queued') this.service.transition(run.id, 'waiting_node'); continue; }
          if (run.status === 'waiting_node') { this.service.transition(run.id, 'queued'); continue; }
          this.service.transition(run.id, 'running', { leaseOwner: node.id, leaseUntil: Date.now() + 15_000, startedAt: new Date().toISOString() }); return;
        }
        if (run.status !== 'queued') continue;
        if(run.continueAfterRunId&&!run.continuation) {
          const source=store.get<Run>('run',run.continueAfterRunId);
          if(['queued','running','waiting_user'].includes(source.status))continue;
          try {const continuation=continuationFor(store,run.projectId,run.policy,source.id);if(!continuation)throw new Error('无原生会话');const ready=store.update<Run>('run',run.id,run.revision,{continuation});this.launch(ready);return;}
          catch{this.service.transition(run.id,'failed',{endedAt:new Date().toISOString(),error:'前序任务尚无可接续会话或需对账；成果保留，可开始新话题'});continue;}
        }
        this.launch(run); return;
      }
    } catch { this.reportFailure(); }
    finally { this.ticking = false; }
  }
  private launch(run: Run) {
    if (run.mode !== 'pi' || !this.plugins) return this.launchWorker(run);
    if (this.plugins.state.pending().length) return;
    if (!this.plugins.gate.acquireRead(run.id)) return;
    try {
      const manifest = this.plugins.state.manifest();
      const sourceId = run.parentRunId || run.continuation?.runId;
      if (sourceId) this.plugins.state.assertCompatible(this.service.store.get<Run>('run', sourceId).pluginManifest, manifest);
      const frozen = this.service.store.update<Run>('run', run.id, run.revision, { pluginManifest: manifest });
      this.launchWorker(frozen);
    } catch (error) {
      const current = this.service.store.get<Run>('run', run.id);
      if (current.status === 'queued') this.service.transition(run.id, 'failed', { endedAt: new Date().toISOString(), error: error instanceof Error ? error.message : '插件环境无法使用' });
      else throw error;
    } finally { if (!this.children.has(run.id)) this.plugins.gate.releaseRead(run.id); }
  }
  private launchWorker(run: Run) {
    const dataDir = dirname(this.service.store.path);
    let continuationPath:string|undefined;
    if(run.continuation)try {
      const checked=continuationFor(this.service.store,run.projectId,run.policy,run.continuation.runId);
      if(JSON.stringify(checked)!==JSON.stringify(run.continuation))throw new Error('会话变化');
      const source=this.service.store.get<Run>('run',run.continuation.runId);
      if(source.workerPid)try{process.kill(source.workerPid,0);throw new Error('原执行进程仍存在');}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ESRCH'))throw error;}
      continuationPath=source.sessionPath;
    }catch {this.service.transition(run.id,'failed',{endedAt:new Date().toISOString(),error:'原会话无法安全接续；请核对会话或开始新话题，原件与成果保留'});return;}
    try { this.service.store.capacity?.assert('workspaces', 64 * 1024); this.service.store.capacity?.assert('sessions', 64 * 1024); }
    catch { this.service.transition(run.id, 'failed', { endedAt: new Date().toISOString(), error: '存储空间不足，未启动执行；调整容量后可新尝试' }); return; }
    const cwd = join(dataDir, 'workspaces', run.projectId); mkdirSync(cwd, { recursive: true });
    const sessionDir = join(dataDir, 'sessions', run.projectId); mkdirSync(sessionDir, { recursive: true });
    const task = this.service.store.get<Task>('task', run.taskId);
    const safeEnv: NodeJS.ProcessEnv = { PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter), ProgramFiles: process.env.ProgramFiles, 'ProgramFiles(x86)': process.env['ProgramFiles(x86)'], PATHEXT: process.env.PATHEXT, ComSpec: process.env.ComSpec, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: cwd, USERPROFILE: cwd, NO_COLOR: '1', PI_OFFLINE: '1', ...workerNetworkEnv() };
    const child = fork(resolve('server/worker.ts'), [], { execPath: process.execPath, execArgv: ['--import', 'tsx'], env: safeEnv, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    this.children.set(run.id, child);
    this.service.transition(run.id, 'running', { leaseOwner: this.owner, leaseUntil: Date.now() + 10_000, startedAt: new Date().toISOString(), workerStartedAt: new Date().toISOString(), workerPid: child.pid });
    child.on('message', async (raw: unknown) => {
      const msg = raw as { type: string; requestId?: string; operationId?: string; name?: string; source?: string; tools?: {name:string;source:string}[]; resources?: PluginDiscovery['resources']; diagnostics?: PluginDiscovery['diagnostics']; phase?: string; args?: Record<string, unknown>; text?: string; error?: string; cost?: number; usage?: ModelUsage; callNumber?:number;sessionPath?: string; sessionId?: string };
      try {
        if (msg.type === 'plugin_failed' && run.pluginManifest) {
          this.plugins?.state.recordLoad(run.pluginManifest, run.id, run.projectId, msg.error?.slice(0, 500));
          if (child.connected) child.send({ type: 'reply', requestId: msg.requestId, result: { recorded: true } });
        }
        if (msg.type === 'plugin_loaded') {
          const manifest = run.pluginManifest; if (!manifest) throw new Error('缺少插件运行清单');
          const allowedSource = (source: string) => manifest.resources.some(r => r.kind === 'extensions' && resolve(r.path) === resolve(source));
          if (!Array.isArray(msg.tools) || msg.tools.some(t => typeof t.name !== 'string' || typeof t.source !== 'string' || !allowedSource(t.source) || isNativePiTool(t.name) || run.policy.toolNames.includes(t.name))) throw new Error('插件工具来源或名称无效');
          const current = this.service.store.get<Run>('run', run.id);
          this.service.store.update<Run>('run', run.id, current.revision, { pluginTools: msg.tools });
          this.plugins?.state.recordLoad(manifest, run.id, run.projectId);
          this.service.store.create<PluginDiscovery>('plugin_discovery', { runId: run.id, projectId: run.projectId, resources: (msg.resources ?? []).slice(0, 500), diagnostics: (msg.diagnostics ?? []).slice(0, 100) });
          if (child.connected) child.send({ type: 'reply', requestId: msg.requestId, result: { loaded: true } });
        }
        if (msg.type === 'plugin_registered') {
          if (typeof msg.name !== 'string' || typeof msg.source !== 'string' || isNativePiTool(msg.name) || run.policy.toolNames.includes(msg.name) || !run.pluginManifest?.resources.some(r => r.kind === 'extensions' && resolve(r.path) === resolve(msg.source!))) throw new Error('动态插件工具来源或名称无效');
          const current = this.service.store.get<Run>('run', run.id);
          const existing = current.pluginTools?.find(t => t.name === msg.name);
          if (existing && existing.source !== msg.source) throw new Error('动态插件工具来源冲突');
          if (!existing) this.service.store.update<Run>('run', run.id, current.revision, { pluginTools: [...(current.pluginTools ?? []), { name: msg.name, source: msg.source }] });
          this.service.store.event('plugin.registered', { name: msg.name, source: msg.source }, { projectId: run.projectId, runId: run.id });
        }
        if (msg.type === 'plugin_tool' && msg.name && msg.source && !isNativePiTool(msg.name) && !run.policy.toolNames.includes(msg.name) && run.pluginManifest?.resources.some(r => r.kind === 'extensions' && resolve(r.path) === resolve(msg.source!)) && ['started', 'completed', 'failed'].includes(msg.phase ?? '')) {
          this.service.store.event('plugin.tool', { name: msg.name, source: msg.source, phase: msg.phase, toolCallId: msg.operationId?.slice(0,200) }, { projectId: run.projectId, runId: run.id });
        }
        if (msg.type === 'tool') { const result = await this.service.executeOperation(run.id, msg.operationId ?? msg.requestId!, msg.name!, msg.args ?? {}); if (child.connected) child.send({ type: 'reply', requestId: msg.requestId, result }); }
        if (msg.type === 'credential') { const result = this.modelAccess ? await this.modelAccess.credential(run.id) : {apiKey:config.apiKey};if(child.connected)child.send({type:'reply',requestId:msg.requestId,result}); }
        if (msg.type === 'reserve') { const result = this.modelAccess ? await this.modelAccess.reserve(this.service,run.id) : (this.service.reserveCall(run.id, config.maxCalls, config.budgetUsd),{apiKey:config.apiKey}); if(child.connected)child.send({ type: 'reply', requestId: msg.requestId, result }); }
        if (msg.type === 'settle') {
          if(run.policy.modelBinding?.kind==='chatgpt'&&!Number.isSafeInteger(msg.callNumber))throw new Error('缺请求序号');
          const settle=()=>this.service.settleCall(run.id,msg.cost,msg.usage,msg.callNumber);
          const capacity=this.service.store.capacity;if(capacity)capacity.exclusive(settle,1000);else settle();
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result:{settled:true}});
        }
        if(msg.type==='model_output_started') {const current=this.service.store.get<Run>('run',run.id);if(current.status==='running'&&Number.isSafeInteger(msg.callNumber)&&msg.callNumber!>0&&msg.callNumber!<=current.calls)this.service.store.event('model.output.started',{callNumber:msg.callNumber},{runId:run.id,projectId:run.projectId});}
        if (msg.type === 'session') {
          const bind=()=>this.service.store.transaction(()=>{
          const current = this.service.store.get<Run>('run', run.id); this.service.store.update<Run>('run', run.id, current.revision, { sessionPath: msg.sessionPath, sessionId: msg.sessionId });
          const existing = this.service.store.list<SessionBinding>('session_binding').find(b => b.runId === run.id);
          if (!existing&&msg.sessionId&&msg.sessionPath) this.service.store.create<SessionBinding>('session_binding', { id:`session:${run.id}`, projectId: run.projectId,runId: run.id, taskId: run.taskId, sessionId: msg.sessionId, sessionPath: msg.sessionPath, worker: this.owner, pid: child.pid, cwd, pluginSignature: run.pluginManifest?.signature, piVersion: '1.0.3', policyVersion: run.policy.version, model: run.policy.modelBinding?.model ?? config.model, authKind:run.policy.modelBinding?.kind ?? 'api', node: process.version });
          });
          const capacity=this.service.store.capacity;if(capacity)capacity.exclusive(bind,1000);else bind();
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result:{bound:true}});
        }
        if (msg.type === 'native_tool' && msg.name && isNativePiTool(msg.name) && run.policy.toolNames.includes(msg.name) && ['started', 'completed', 'failed'].includes(msg.phase ?? '')) {
          // Tool arguments/output can contain private data; persist progress metadata only.
          this.service.store.event('native.tool', { name: msg.name, phase: msg.phase, toolCallId: msg.operationId?.slice(0, 200) }, { projectId: run.projectId, runId: run.id });
        }
        if (msg.type === 'text') this.service.store.event('assistant.text', { text: msg.text?.slice(0, 30_000) }, { projectId: run.projectId, runId: run.id });
        if (msg.type === 'done') { this.finish(run.id, !msg.error, msg.error); if (msg.requestId && child.connected) child.send({ type:'reply',requestId:msg.requestId,result:{status:this.service.store.get<Run>('run',run.id).status} }); }
      } catch (error) { if (msg.requestId && child.connected) child.send({ type: 'reply', requestId: msg.requestId, error: error instanceof Error ? error.message : '操作失败' }); }
    });
    // Child stderr is intentionally not persisted: provider errors can contain credentials.
    child.stderr?.on('data', () => {}); child.stdout?.on('data', () => {});
    child.on('error', () => this.finish(run.id, false, '执行进程无法启动'));
    child.on('exit', () => { this.children.delete(run.id); this.plugins?.gate.releaseRead(run.id); const current = this.service.store.get<Run>('run', run.id); if (current.status === 'running') { this.service.transition(run.id, 'interrupted', { endedAt: new Date().toISOString(), error: '执行进程意外退出；需要对账' }); this.service.reconcileInterruptedOperations(run.id); } });
    child.send({ type: 'start', run, goal: task.goal, cwd, sessionDir,continuationPath, context: task.context, assetIds: task.context.assetIds, memories: this.service.memories(run.projectId), storage: this.service.store.capacity ? {dataDir,limits:this.service.store.capacity.limits} : undefined, model: run.mode === 'pi' ? { provider: run.policy.modelBinding?.provider ?? config.provider, id: run.policy.modelBinding?.model ?? config.model } : undefined });
  }
  finish(id: string, success: boolean, error?: string) {
    const run = this.service.store.get<Run>('run', id); if (run.status !== 'running') return;
    const { store } = this.service;
    let verified = success && run.resultAssetIds.length > 0;
    if (verified) try { for (const assetId of run.resultAssetIds) this.service.assets.read(store.get<Asset>('asset', assetId)); } catch { verified = false; }
    const deadlineReached=Boolean(run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs));
    const state = deadlineReached ? 'failed' : run.cancelRequested ? 'cancelled' : success ? 'completed' : 'failed';
    store.transaction(() => {
      const safeCode = error && /^worker_failed:[a-z_]+$/.test(error) ? error : error ? 'host_execution_failed' : undefined;
      this.service.transition(id, state, { endedAt: new Date().toISOString(),timedOutAt:deadlineReached?(run.timedOutAt||new Date().toISOString()):undefined, error: deadlineReached ? '任务超过运行时间，已停止；已有成果保留' : state==='cancelled'?undefined:safeCode ? `执行失败（${safeCode}）；请核对配置、预算与诊断包` : undefined });
      const task = store.get<Task>('task', run.taskId);
      const fixedGoal = run.mode === 'fixture' && task.goal === '运行固定资料计算，保存报告、图表和文章草稿';
      store.update<Task>('task', task.id, task.revision, { acceptance: state === 'completed' ? verified && fixedGoal ? 'passed' : 'needs_review' : 'failed' });
    });
    // Model completion without an asset remains needs_review, never passed.
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    await Promise.all([...this.children.values()].map(child => new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill(); })));
    this.service.store.release('scheduler', this.owner);
  }
  terminateOwnedWorker(id: string) {
    const child = this.children.get(id); const run = this.service.store.get<Run>('run', id);
    if (!child || run.workerPid !== child.pid || run.leaseOwner !== this.owner) throw new Error('没有属于本宿主的执行进程');
    return child.kill();
  }
  acknowledge(id: string) {
    const run = this.service.store.get<Run>('run', id); if (run.status !== 'interrupted') throw new Error('运行未中断');
    for (const assetId of run.resultAssetIds) this.service.assets.read(this.service.store.get<Asset>('asset', assetId));
    if (run.workerPid) {
      try { process.kill(run.workerPid, 0); throw new Error('登记的 PID 仍存在，先核对归属并停止原执行'); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
    }
    if (run.mode === 'node') throw new Error('电脑执行需节点回执对账，不能直接确认');
    return this.service.store.update<Run>('run', id, run.revision, { error: '进程已不存在，资产已对账；允许新尝试' });
  }
}

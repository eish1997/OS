import { isNativePiTool } from '../shared/pi-tools.js';
import { persistTextChunk } from './run-stream.js';
import { persistToolProgress, recoveryTools, requireToolReconciliation, reopenForceStoppedTools } from './tool-progress.js';
import { createRunOutputDirectory } from './native-output.js';
import {acceptRunInput,inputFingerprint,updateRunInput} from './run-input.js';
import type {RunInputState} from '../shared/run-input.js';
import {AppError} from './store.js';
import {terminateOwnedProcessTree,terminateProcessTreeByPid,workerProcessKind} from './owned-process.js';
import type {McpCredentials} from './mcp-credentials.js';
import {McpConfigurations} from './mcp-config.js';
import {mcpDiagnosticLabels,type McpConnectionCode,type McpDiagnostic} from '../shared/mcp.js';
import {recordMcpConnection, disconnectOwnedMcpTransports} from './mcp-diagnostics.js';
import {createInteraction,answerInteraction,acknowledgeInteraction,closeInteraction,closeInteractions} from './plugin-interaction.js';
import {recordPluginNotice} from './plugin-notice.js';
import type {PluginInteraction,PluginInteractionRequest,PluginInteractionAnswer} from '../shared/plugin-interaction.js';
import {assertMcpCompatible,mcpEnvironment,allowedExtensionSource} from './mcp-runtime.js';
import { fork, type ChildProcess } from 'node:child_process';
import { workerNetworkEnv } from './network.js';
import { randomUUID } from 'node:crypto';
import { join, resolve, dirname, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import { isLiveExecution, type Run, type Task, type LocalNode, type Asset, type ModelUsage, type SessionBinding, type Operation } from '../shared/contracts.js';
import type { ModelAccess } from './model-access.js';
import { Service } from './service.js';
import { PiSettings } from './pi-settings.js';
import { config, modelConfigured } from './config.js';
import { continuationFor, prepareSource, sourceInspection, releasePublishedSession, reconcileUnpublishedSessions } from './native-session.js';
import { stopRecordedSpawnProcesses } from './spawn-ledger.js';
import { nativeNeedsPreparation } from './native-inspection-async.js';
import type { Plugins } from './plugins.js';
import type { PluginDiscovery } from '../shared/plugins.js';
export class Scheduler {
  readonly owner = randomUUID(); private timer?: ReturnType<typeof setInterval>;
  private children = new Map<string, ChildProcess>(); private ticking = false;
  private terminations = new Map<string,Promise<boolean>>();
  private orphanStops = new Set<number>();
  private stopping = false;
  private stopped?: Promise<void>;
  private preparation?: { controller: AbortController; done: Promise<void> };
  constructor(private service: Service, private reportFailure = () => console.error('Scheduler: execution state update failed'), private modelAccess?: ModelAccess, private plugins?: Plugins,private mcpCredentials?:McpCredentials) {}
  pluginMaintenanceBlocked() { return this.ticking || Boolean(this.preparation) || this.children.size > 0 || this.service.store.list<Run>('run').some(r => isLiveExecution(r.status) || (r.status === 'interrupted' && !r.error?.includes('已对账'))); }
  start() {
    if(this.stopping)throw new Error('调度器已关闭，请创建新的宿主实例');
    if(this.timer)return;
    this.timer = setInterval(() => this.tick(), 750); this.tick();
  }
  answerDialog(runId:string,id:string,revision:number,commandId:string,answer:PluginInteractionAnswer){
    const store=this.service.store;const prior=store.get<PluginInteraction>('plugin_interaction',id);
    if(prior.runId===runId&&prior.answerCommandId===commandId)return answerInteraction(store,runId,id,revision,commandId,answer).interaction;
    const run=store.get<Run>('run',runId);const child=this.children.get(runId);
    if(!child?.connected||child.pid!==run.workerPid||run.leaseOwner!==this.owner)throw new AppError(409,'原执行进程不可接收答复，不会转发到其他执行');
    const result=answerInteraction(store,runId,id,revision,commandId,answer);
    if(result.fresh)child.send({type:'interaction_answer',id,answer:result.answer},error=>{if(error)try{closeInteraction(store,runId,id);}catch{this.reportFailure();}});
    return result.interaction;
  }
  steer(runId:string,conversationId:string,commandId:string,text:string){
    const store=this.service.store;
    if(store.commandReceipt(`run-input:${commandId}`,inputFingerprint(runId,conversationId,text)))return acceptRunInput(store,runId,conversationId,commandId,text).input;
    const child=this.children.get(runId);const run=store.get<Run>('run',runId);
    if(!child?.connected||child.pid!==run.workerPid||run.leaseOwner!==this.owner)throw new AppError(409,'当前执行进程不可接收指导，请核对状态');
    const accepted=acceptRunInput(store,runId,conversationId,commandId,text);
    if(accepted.fresh)child.send({type:'steer',input:{id:accepted.input.id,text:accepted.input.text}},error=>{
      if(error)try{updateRunInput(store,runId,accepted.input.id,'unknown','未确认消息是否送达，不自动重放');}catch{this.reportFailure();}
    });
    return accepted.input;
  }
  async withIdleMaintenance(action: (owner: string, signal: AbortSignal) => Promise<void>): Promise<boolean> {
    if(this.stopping)return false;
    if (this.plugins && (this.plugins.state.pending().length || this.plugins.gate.status().writer)) return false;
    if (this.ticking || this.preparation || this.children.size) return false;
    const {store}=this.service;
    if (store.list<Run>('run').some(r=>['running','waiting_interaction','queued','waiting_node','waiting_user'].includes(r.status)||(r.status==='interrupted'&&!r.error?.includes('已对账')))) return false;
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
    if(this.stopping)return;
    if (this.preparation) return;
    if (this.plugins?.mutating) return;
    if (this.ticking) return; this.ticking = true;
    try {
      const { store } = this.service;
      if (!store.lease('scheduler', this.owner, 5000)) return;
      let runs = store.list<Run>('run');
      for (const run of runs.filter(r => isLiveExecution(r.status))) {
        const child = this.children.get(run.id);
        if (child) {
          // Re-read: dialog wait sync can bump revision between list and lease renewal.
          let current=store.get<Run>('run',run.id);
          if(!isLiveExecution(current.status))continue;
          if(!current.timedOutAt&&Date.now()-Date.parse(current.startedAt!)>=current.policy.timeoutMs) {
            current=store.update<Run>('run',run.id,current.revision,{timedOutAt:new Date().toISOString()});store.event('run.timeout_requested',{}, {projectId:run.projectId,runId:run.id});
          }
          if(current.cancelRequested || current.timedOutAt) {
            if(child.connected)child.send({type:'cancel'});
            const requestedAt=Date.parse(current.timedOutAt || current.cancelRequestedAt || current.startedAt!);
            if(Date.now()-requestedAt>=5000){this.terminate(run.id,child);current=store.get<Run>('run',run.id);store.update<Run>('run',run.id,current.revision,{leaseUntil:Date.now()+10_000});continue;}
          }
          store.update<Run>('run',run.id,current.revision,{leaseUntil:Date.now()+10_000});
        } else if ((run.leaseUntil ?? 0) < Date.now()) {
          if (run.workerPid && this.orphanStops.has(run.workerPid)) continue;
          if (run.workerPid) {
            try { process.kill(run.workerPid, 0); this.orphanStops.add(run.workerPid); void this.retireOrphan(run.id, run.workerPid); continue; }
            catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
          }
          this.interruptLost(run.id);
          reconcileUnpublishedSessions(store);
        }
      }
      runs = store.list<Run>('run');
      if (runs.some(r => isLiveExecution(r.status) || (r.status === 'interrupted' && !r.error?.includes('已对账')))) return;
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
          if(['queued','running','waiting_interaction','waiting_user'].includes(source.status))continue;
          try {
            const input = sourceInspection(store, source);
            if (input && nativeNeedsPreparation(input)) { this.prepareRun(run, source); return; }
            const continuation=continuationFor(store,run.projectId,run.policy,source.id);if(!continuation)throw new Error('无原生会话');const ready=store.update<Run>('run',run.id,run.revision,{continuation});this.launch(ready);return;
          }
          catch{this.service.transition(run.id,'failed',{endedAt:new Date().toISOString(),error:'前序任务尚无可接续会话或需对账；成果保留，可开始新话题'});continue;}
        }
        this.launch(run); return;
      }
    } catch { this.reportFailure(); }
    finally { this.ticking = false; }
  }
  private interruptLost(runId: string) {
    const current = this.service.store.get<Run>('run', runId);
    if (!isLiveExecution(current.status) || this.children.has(runId) || (current.leaseUntil ?? 0) >= Date.now()) return;
    this.service.transition(runId, 'interrupted', { endedAt: new Date().toISOString(), error: '执行失联；需要核对进程与产物后对账' });
    disconnectOwnedMcpTransports(this.service.store, runId);
    const lost = this.service.store.get<Run>('run', runId);
    void stopRecordedSpawnProcesses(dirname(this.service.store.path), lost.projectId, runId).catch(() => this.reportFailure());
    closeInteractions(this.service.store, runId, 'worker_exited');
    this.service.reconcileInterruptedOperations(runId);
  }
  private async retireOrphan(runId: string, pid: number) {
    let kind: Awaited<ReturnType<typeof workerProcessKind>> = 'unreadable';
    try {
      kind = await workerProcessKind(pid);
      if (kind === 'owned') await terminateProcessTreeByPid(pid);
    } catch { this.reportFailure(); }
    finally { this.orphanStops.delete(pid); }
    try { this.interruptLost(runId); } catch { this.reportFailure(); }
    if (kind === 'unreadable') return;
    if (kind === 'owned') {
      try { process.kill(pid, 0); return; }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) return; }
    }
    try { reconcileUnpublishedSessions(this.service.store); } catch { this.reportFailure(); }
  }
  private launch(run: Run) {
    if(this.stopping)return;
    try { if (run.continuation) {
      const source = this.service.store.get<Run>('run', run.continuation.runId); const input = sourceInspection(this.service.store, source);
      if (input && nativeNeedsPreparation(input)) { if (this.preparation) throw new Error('历史在校验完成后变化'); this.prepareRun(run, source); return; }
    } } catch { this.service.transition(run.id, 'failed', { endedAt: new Date().toISOString(), error: '历史来源已变化或无法读取，原件保留' }); return; }
    if (run.mode !== 'pi' || !this.plugins) return this.launchWorker(run);
    if (this.plugins.state.pending().length) return;
    if (!this.plugins.gate.acquireRead(run.id)) return;
    try {
      const manifest = this.plugins.state.manifest();
      if(run.importedContinuation&&run.importedContinuation.pluginSignature!==manifest.signature)throw new Error('导入恢复的插件环境已变化，请重新核对');
      const sourceId = run.continuation?.runId || (run.importedContinuation?undefined:run.parentRunId);
      if (sourceId) this.plugins.state.assertCompatible(this.service.store.get<Run>('run', sourceId).pluginManifest, manifest);
      const frozen = this.service.store.update<Run>('run', run.id, run.revision, { pluginManifest: manifest });
      this.launchWorker(frozen);
    } catch (error) {
      const current = this.service.store.get<Run>('run', run.id);
      if (current.status === 'queued') this.service.transition(run.id, 'failed', { endedAt: new Date().toISOString(), error: error instanceof Error ? error.message : '插件环境无法使用' });
      else throw error;
    } finally { if (!this.children.has(run.id)) this.plugins.gate.releaseRead(run.id); }
  }
  private prepareRun(run: Run, source: Run) {
    const controller = new AbortController();
    const { store } = this.service;
    const renewal = setInterval(() => {
      try {
        const current = store.get<Run>('run', run.id);
        if (current.status !== 'queued' || !store.lease('scheduler', this.owner, 5000)) controller.abort();
      } catch { controller.abort(); }
    }, 500);
    const done = (async () => {
      try {
        await prepareSource(store, source, controller.signal);
        if (controller.signal.aborted) return;
        const current = store.get<Run>('run', run.id); if (current.status !== 'queued') return;
        if (!store.lease('scheduler', this.owner, 5000)) return;
        if (current.continueAfterRunId && !current.continuation) {
          const continuation = continuationFor(store, current.projectId, current.policy, source.id);
          if (!continuation) throw new Error('前序历史不可接续');
          this.launch(store.update<Run>('run', current.id, current.revision, { continuation }));
        } else this.launch(current);
      } catch {
        const current = store.get<Run>('run', run.id);
        if (current.status === 'queued' && !controller.signal.aborted) this.service.transition(current.id, 'failed', { endedAt: new Date().toISOString(), error: '历史校验失败或来源发生变化；原件保留，请检查后重试' });
      } finally { clearInterval(renewal); this.preparation = undefined; }
    })();
    this.preparation = { controller, done };
  }
  private launchWorker(run: Run) {
    let mcpEnv:NodeJS.ProcessEnv={};
    if(run.mode==='pi')try{
      const store=this.service.store;let mcpManifest=new McpConfigurations(store).manifest(run.projectId);
      if(this.mcpCredentials){const resolved=this.mcpCredentials.resolve(mcpManifest,run.projectId);mcpManifest=resolved.manifest;mcpEnv=resolved.environment;}else mcpEnv=mcpEnvironment(mcpManifest,process.env);
      if(run.importedContinuation&&run.importedContinuation.mcpSignature!==mcpManifest.signature)throw new Error('导入恢复的MCP环境已变化，请重新核对');
      const sourceId=run.continuation?.runId||(run.importedContinuation?undefined:run.parentRunId);
      if(sourceId)assertMcpCompatible(store.get<Run>('run',sourceId),mcpManifest);
      run=store.update<Run>('run',run.id,run.revision,{mcpManifest});
    }catch(error){this.service.transition(run.id,'failed',{endedAt:new Date().toISOString(),error:error instanceof Error?error.message:'MCP配置无法使用'});return;}
    const dataDir = dirname(this.service.store.path);
    let continuationPath:string|undefined;
    if(run.continuation)try {
      const checked=continuationFor(this.service.store,run.projectId,run.policy,run.continuation.runId);
      const {entryId,...identity}=run.continuation;
      if(JSON.stringify(checked)!==JSON.stringify(identity))throw new Error('会话变化');
      const source=this.service.store.get<Run>('run',run.continuation.runId);
      if(source.workerPid)try{process.kill(source.workerPid,0);throw new Error('原执行进程仍存在');}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ESRCH'))throw error;}
      continuationPath=source.sessionPath;
    }catch {this.service.transition(run.id,'failed',{endedAt:new Date().toISOString(),error:'原会话无法安全接续；请核对会话或开始新话题，原件与成果保留'});return;}
    try { this.service.store.capacity?.assert('workspaces', 64 * 1024); this.service.store.capacity?.assert('sessions', 64 * 1024); }
    catch { this.service.transition(run.id, 'failed', { endedAt: new Date().toISOString(), error: '存储空间不足，未启动执行；调整容量后可新尝试' }); return; }
    const cwd = join(dataDir, 'workspaces', run.projectId); mkdirSync(cwd, { recursive: true });
    const sessionDir = join(dataDir, 'sessions', run.projectId); mkdirSync(sessionDir, { recursive: true });
    let outputDir:string;
    try{outputDir=createRunOutputDirectory(dataDir,run.projectId,run.id);}catch{this.service.transition(run.id,'failed',{endedAt:new Date().toISOString(),error:'无法建立本次工具输出目录，请核对存储路径'});return;}
    const task = this.service.store.get<Task>('task', run.taskId);
    const safeEnv: NodeJS.ProcessEnv = { PATH: [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter), ProgramFiles: process.env.ProgramFiles, 'ProgramFiles(x86)': process.env['ProgramFiles(x86)'], PATHEXT: process.env.PATHEXT, ComSpec: process.env.ComSpec, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: cwd, USERPROFILE: cwd, NO_COLOR: '1', PI_OFFLINE: '1', ...workerNetworkEnv() };
    const child = fork(resolve('server/worker.ts'), [], { execPath: process.execPath, execArgv: ['--import', pathToFileURL(resolve('server/spawn-ledger-register.mjs')).href, '--import', 'tsx'], env: {...safeEnv,TEMP:outputDir,TMP:outputDir,TMPDIR:outputDir}, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    this.children.set(run.id, child);
    this.service.transition(run.id, 'running', { leaseOwner: this.owner, leaseUntil: Date.now() + 10_000, startedAt: new Date().toISOString(), workerStartedAt: new Date().toISOString(), workerPid: child.pid });
    child.on('message', async (raw: unknown) => {
      const msg = raw as { type: string; requestId?: string; operationId?: string; name?: string; source?: string; tools?: {name:string;source:string}[]; resources?: PluginDiscovery['resources']; diagnostics?: PluginDiscovery['diagnostics']; phase?: string; args?: Record<string, unknown>; text?: string; error?: string; cost?: number; usage?: ModelUsage; callNumber?:number;sessionPath?: string; sessionId?: string };
      try {
        if(msg.type==='image_attachments'){
          const result=await imageAttachments(this.service.store,this.service.assets,run.projectId,task.context.assetIds,(raw as {supportsImages?:boolean}).supportsImages===true);
          if(child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if(msg.type==='input_state'){
          const value=raw as {id:string;state:RunInputState;reason?:string};
          const record=()=>updateRunInput(this.service.store,run.id,value.id,value.state,value.reason);
          const capacity=this.service.store.capacity;const result=capacity?capacity.exclusive(record,1000):record();
          if(child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if (msg.type === 'plugin_failed' && run.pluginManifest) {
          this.plugins?.state.recordLoad(run.pluginManifest, run.id, run.projectId, msg.error?.slice(0, 500));
          if (child.connected) child.send({ type: 'reply', requestId: msg.requestId, result: { recorded: true } });
        }
        if (msg.type === 'plugin_loaded') {
          const manifest = run.pluginManifest; if (!manifest) throw new Error('缺少插件运行清单');
          const allowedSource = (source: string) => allowedExtensionSource(run,source);
          if (!Array.isArray(msg.tools) || msg.tools.some(t => typeof t.name !== 'string' || typeof t.source !== 'string' || !allowedSource(t.source) || isNativePiTool(t.name) || run.policy.toolNames.includes(t.name))) throw new Error('插件工具来源或名称无效');
          const current = this.service.store.get<Run>('run', run.id);
          this.service.store.update<Run>('run', run.id, current.revision, { pluginTools: msg.tools });
          this.plugins?.state.recordLoad(manifest, run.id, run.projectId);
          this.service.store.create<PluginDiscovery>('plugin_discovery', { runId: run.id, projectId: run.projectId, resources: (msg.resources ?? []).slice(0, 500), diagnostics: (msg.diagnostics ?? []).slice(0, 100) });
          if (child.connected) child.send({ type: 'reply', requestId: msg.requestId, result: { loaded: true } });
        }
        if(msg.type==='interaction_open'){
          const request=(raw as {request:PluginInteractionRequest}).request;
          const result=createInteraction(this.service.store,run.id,request);
          if(child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if(msg.type==='plugin_notice'){
          const notice=(raw as {notice:Parameters<typeof recordPluginNotice>[2]}).notice;
          const record=()=>recordPluginNotice(this.service.store,run.id,notice);
          const capacity=this.service.store.capacity;
          const result=capacity?await capacity.exclusiveAsync(record,1000):record();
          if(child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if(msg.type==='interaction_delivered'||msg.type==='interaction_close'){
          const id=(raw as {id:string}).id;
          const result=msg.type==='interaction_delivered'?acknowledgeInteraction(this.service.store,run.id,id):closeInteraction(this.service.store,run.id,id);
          if(child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if(msg.type==='mcp_connection'){
          const server=(raw as {server?:string}).server;
          const code=(raw as {code?:McpConnectionCode}).code;
          if(typeof server!=='string'||!server||(code!=='connected'&&code!=='disconnected'&&code!=='closed'))throw new Error('MCP连接状态无效');
          recordMcpConnection(this.service.store,run.id,server,code);
        }
        if(msg.type==='mcp_diagnostic'){
          const diagnostic=(raw as {diagnostic?:McpDiagnostic}).diagnostic;
          if(!run.mcpManifest?.enabled||!diagnostic||!Object.hasOwn(mcpDiagnosticLabels,diagnostic.code)||(diagnostic.server!==undefined&&!run.mcpManifest.servers.some(server=>server.name===diagnostic.server)))throw new Error('MCP诊断来源无效');
          const safe:McpDiagnostic={code:diagnostic.code,...(diagnostic.server!==undefined?{server:diagnostic.server}:{})};
          this.service.store.transaction(()=>{const current=this.service.store.get<Run>('run',run.id);const previous=current.mcpDiagnostics??[];
            if(previous.some(item=>item.code===safe.code&&item.server===safe.server)||previous.length>=100)return;
            this.service.store.update<Run>('run',run.id,current.revision,{mcpDiagnostics:[...previous,safe]});
            this.service.store.event('run.mcp_diagnostic',safe,{runId:run.id,projectId:run.projectId});
          });
        }
        if (msg.type === 'plugin_registered') {
          if (typeof msg.name !== 'string' || typeof msg.source !== 'string' || isNativePiTool(msg.name) || run.policy.toolNames.includes(msg.name) || !allowedExtensionSource(run,msg.source!)) throw new Error('动态插件工具来源或名称无效');
          const record=()=>this.service.store.transaction(()=>{
          const current = this.service.store.get<Run>('run', run.id);
          const existing = current.pluginTools?.find(t => t.name === msg.name);
          if (existing && existing.source !== msg.source) throw new Error('动态插件工具来源冲突');
          if (!existing) this.service.store.update<Run>('run', run.id, current.revision, { pluginTools: [...(current.pluginTools ?? []), { name: msg.name!, source: msg.source! }] });
          this.service.store.event('plugin.registered', { name: msg.name, source: msg.source }, { projectId: run.projectId, runId: run.id });
          });
          const capacity=this.service.store.capacity;if(capacity)capacity.exclusive(record,1000);else record();
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result:{registered:true}});
        }
        if (msg.type === 'plugin_tool' && msg.name && msg.source && !isNativePiTool(msg.name) && !run.policy.toolNames.includes(msg.name) && allowedExtensionSource(run,msg.source!) && ['started', 'completed', 'failed'].includes(msg.phase ?? '')) {
          this.service.store.event('plugin.tool', { name: msg.name, source: msg.source, phase: msg.phase, toolCallId: msg.operationId?.slice(0,200) }, { projectId: run.projectId, runId: run.id });
        }
        if (msg.type === 'tool') { const result = await this.service.executeOperation(run.id, msg.operationId ?? msg.requestId!, msg.name!, msg.args ?? {}); if (child.connected) child.send({ type: 'reply', requestId: msg.requestId, result }); }
        if (msg.type === 'credential') { const result = this.modelAccess ? await this.modelAccess.credential(run.id) : {apiKey:config.apiKey};if(child.connected)child.send({type:'reply',requestId:msg.requestId,result}); }
        if (msg.type === 'retry_state') {
          const state = (raw as {state?: import('../shared/pi-runtime.js').PiRetryState}).state;
          if (!state || !['waiting','retrying','finished','succeeded','failed'].includes(state.phase) || (state.source !== undefined && !['agent','compaction','branch_summary'].includes(state.source)) || !Number.isSafeInteger(state.attempt) || state.attempt < 1 || state.attempt > 3 || state.maxAttempts !== 3 || !Number.isFinite(state.delayMs) || state.delayMs < 0 || state.delayMs > 30000) throw new Error('重试状态无效');
          this.service.store.transaction(()=>{
            const current=this.service.store.get<Run>('run',run.id);
            if(!isLiveExecution(current.status)) return;
            const retryState={phase:state.phase,source:state.source,attempt:state.attempt,maxAttempts:state.maxAttempts,delayMs:state.delayMs};
            this.service.store.update<Run>('run',run.id,current.revision,{retryState});
            this.service.store.event('run.retry_state',retryState,{runId:run.id,projectId:run.projectId});
          });
        }
        if (msg.type === 'compaction') {
          const state = (raw as { state?: import('../shared/pi-runtime.js').PiCompactionState }).state;
          if (!state || !['running','completed','cancelled','failed'].includes(state.phase) || !['manual','threshold','overflow'].includes(state.reason)) throw new Error('压缩状态无效');
          const tokens = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
          const compaction = { phase: state.phase, reason: state.reason, tokensBefore: tokens(state.tokensBefore), estimatedTokensAfter: tokens(state.estimatedTokensAfter) };
          this.service.store.transaction(() => {
            const current = this.service.store.get<Run>('run', run.id);
            if (!isLiveExecution(current.status)) return;
            this.service.store.update<Run>('run', run.id, current.revision, { compaction });
            this.service.store.event('run.compaction', compaction, { runId: run.id, projectId: run.projectId });
          });
        }
        if (msg.type === 'reserve') {
          const purpose = (raw as { purpose?: import('../shared/pi-runtime.js').ModelRequestPurpose }).purpose ?? 'agent';
          if (typeof msg.requestId !== 'string' || !msg.requestId) throw new Error('缺请求标识');
          const result = this.modelAccess ? await this.modelAccess.reserve(this.service,run.id,purpose,msg.requestId) : { apiKey: config.apiKey, ...this.service.reserveRequest(run.id,msg.requestId,config.maxCalls,config.budgetUsd,purpose) };
          if(child.connected)child.send({ type: 'reply', requestId: msg.requestId, result });
        }
        if (msg.type === 'settle') {
          if(!Number.isSafeInteger(msg.callNumber))throw new Error('缺请求序号');
          const settle=()=>this.service.settleCall(run.id,msg.cost,msg.usage,msg.callNumber);
          const capacity=this.service.store.capacity;if(capacity)capacity.exclusive(settle,1000);else settle();
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result:{settled:true}});
        }
        if(msg.type==='model_output_started') {const current=this.service.store.get<Run>('run',run.id);if(isLiveExecution(current.status)&&Number.isSafeInteger(msg.callNumber)&&msg.callNumber!>0&&msg.callNumber!<=current.calls)this.service.store.event('model.output.started',{callNumber:msg.callNumber},{runId:run.id,projectId:run.projectId});}
        if (msg.type === 'session') {
          const bind=()=>this.service.store.transaction(()=>{
          const current = this.service.store.get<Run>('run', run.id); this.service.store.update<Run>('run', run.id, current.revision, { sessionPath: msg.sessionPath, sessionId: msg.sessionId });
          const existing = this.service.store.list<SessionBinding>('session_binding').find(b => b.runId === run.id);
          if (!existing&&msg.sessionId&&msg.sessionPath) this.service.store.create<SessionBinding>('session_binding', { id:`session:${run.id}`, projectId: run.projectId,runId: run.id, taskId: run.taskId, sessionId: msg.sessionId, sessionPath: msg.sessionPath, worker: this.owner, pid: child.pid, cwd, pluginSignature: run.pluginManifest?.signature, piVersion: '1.0.3', policyVersion: run.policy.version, model: run.policy.modelBinding?.model ?? config.model, authKind:run.policy.modelBinding?.kind ?? 'api', node: process.version });
          });
          const capacity=this.service.store.capacity;if(capacity)capacity.exclusive(bind,1000);else bind();
          if(typeof msg.sessionPath==='string')releasePublishedSession(msg.sessionPath,sessionDir);
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result:{bound:true}});
        }
        if (msg.type === 'native_tool' && msg.name && isNativePiTool(msg.name) && run.policy.toolNames.includes(msg.name) && ['started', 'completed', 'failed'].includes(msg.phase ?? '')) {
          // Tool arguments/output can contain private data; persist progress metadata only.
          this.service.store.event('native.tool', { name: msg.name, phase: msg.phase, toolCallId: msg.operationId?.slice(0, 200) }, { projectId: run.projectId, runId: run.id });
        }
        if (msg.type === 'text_chunk') {
          const record=()=>persistTextChunk(this.service.store,run.id,(raw as {chunk:import('../shared/run-stream.js').TextChunk}).chunk);
          const capacity=this.service.store.capacity;const result=capacity?capacity.exclusive(record,1000):record();
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if(msg.type==='tool_progress'){
          const progress=(raw as {progress:import('../shared/run-stream.js').ToolProgress}).progress;
          const current=this.service.store.get<Run>('run',run.id);
          const allowed=progress && (run.policy.toolNames.includes(progress.name)&&progress.source==='工作台/原生工具'||current.pluginTools?.some(t=>t.name===progress.name&&t.source===progress.source));
          if(!allowed)throw new Error('工具执行来源未获许可');
          const record=()=>persistToolProgress(this.service.store,run.id,progress);
          const capacity=this.service.store.capacity;const result=capacity?capacity.exclusive(record,1000):record();
          if(msg.requestId&&child.connected)child.send({type:'reply',requestId:msg.requestId,result});
        }
        if (msg.type === 'text') this.service.store.event('assistant.text', { text: msg.text?.slice(0, 30_000) }, { projectId: run.projectId, runId: run.id });
        if (msg.type === 'done') { this.finish(run.id, !msg.error, msg.error); if (msg.requestId && child.connected) child.send({ type:'reply',requestId:msg.requestId,result:{status:this.service.store.get<Run>('run',run.id).status} }); }
      } catch (error) { if (msg.requestId && child.connected) child.send({ type: 'reply', requestId: msg.requestId, error: error instanceof Error ? error.message : '操作失败' }); }
    });
    // Child stderr is intentionally not persisted: provider errors can contain credentials.
    child.stderr?.on('data', () => {}); child.stdout?.on('data', () => {});
    child.on('error', () => this.finish(run.id, false, '执行进程无法启动'));
    child.on('exit', () => { void this.workerExited(run.id).catch(()=>this.reportFailure()); });
    const toolRecovery=recoveryTools(this.service.store,run.id).filter(t=>t.schemaVersion===1&&t.reconciliation).map(t=>({runId:t.runId,callId:t.callId,name:t.name,...t.reconciliation}));
    const imported = new PiSettings(this.service.store).configuration();
    child.send({ type: 'start', mcpEnv, run, goal: task.goal, cwd, sessionDir,outputDir,continuationPath,toolRecovery, context: task.context, assetIds: task.context.assetIds, memories: this.service.memories(run.projectId), storage: this.service.store.capacity ? {dataDir,limits:this.service.store.capacity.limits} : undefined, settingsResources: { skills: imported.importedSkillPaths ?? [], prompts: imported.importedPromptPaths ?? [] }, model: run.mode === 'pi' ? { provider: run.policy.modelBinding?.provider ?? config.provider, id: run.policy.modelBinding?.model ?? config.model } : undefined });
  }
  finish(id: string, success: boolean, error?: string) {
    const run = this.service.store.get<Run>('run', id); if (!isLiveExecution(run.status)) return;
    const { store } = this.service;
    let verified = success && run.resultAssetIds.length > 0;
    if (verified) try { for (const assetId of run.resultAssetIds) this.service.assets.read(store.get<Asset>('asset', assetId)); } catch { verified = false; }
    const deadlineReached=Boolean(run.timedOutAt || (run.startedAt&&Date.now()-Date.parse(run.startedAt)>=run.policy.timeoutMs));
    // Force-stop snapshots the tree before kill. Ignore racing worker done (success or
    // mcp_outcome_unknown) so workerExited can mark interrupted only after tree confirmation.
    if (this.terminations.has(id) && !run.cancelRequested && !deadlineReached) return;
    const state = deadlineReached ? 'failed' : run.cancelRequested ? 'cancelled' : success ? 'completed' : 'failed';
    store.transaction(() => {
      const safeCode = error && /^worker_failed:[a-z_]+$/.test(error) ? error : error ? 'host_execution_failed' : undefined;
      const failureMessage = safeCode === 'worker_failed:model_idle_timeout' ? '模型连续无响应达到设置上限，已停止当前请求；已有历史保留，可调整无响应上限后新建接续任务' : safeCode ? `执行失败（${safeCode}）；请核对配置、预算与诊断包` : undefined;
      this.service.transition(id, state, { endedAt: new Date().toISOString(),timedOutAt:deadlineReached?(run.timedOutAt||new Date().toISOString()):undefined, error: deadlineReached ? '任务超过运行时间，已停止；已有成果保留' : state==='cancelled'?undefined:failureMessage });
      const task = store.get<Task>('task', run.taskId);
      const fixedGoal = run.mode === 'fixture' && task.goal === '运行固定资料计算，保存报告、图表和文章草稿';
      store.update<Task>('task', task.id, task.revision, { acceptance: state === 'completed' ? verified && fixedGoal ? 'passed' : 'needs_review' : 'failed' });
    });
    // Model completion without an asset remains needs_review, never passed.
  }
  stop(): Promise<void> {
    this.stopping = true;
    return this.stopped ??= this.stopOwnedWorkers();
  }
  private async stopOwnedWorkers() {
    if (this.timer) clearInterval(this.timer);
    if (this.preparation) { this.preparation.controller.abort(); await this.preparation.done; }
    await Promise.all([...this.children].map(async([id,child])=>{
      const exited=child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise<void>(resolve=>child.once('exit',()=>resolve()));
      // A worker may still be flushing its final records while the run is running.
      // Give it the same bounded exit window as a terminal run before forced cleanup.
      // Tree cleanup records a second listing before termination so a child born after the first listing is included. A taskkill error after the parent already vanished is not confirmation.
      if(!this.terminations.has(id)){
        let timer:ReturnType<typeof setTimeout>|undefined;
        try{await Promise.race([exited,new Promise<void>(resolve=>{timer=setTimeout(resolve,750);})]);}finally{clearTimeout(timer);}
      }
      if(child.exitCode===null&&child.signalCode===null&&!await this.terminate(id,child)&&child.exitCode===null&&child.signalCode===null)throw new Error('无法终止本宿主执行进程树');
      await exited;await this.workerExited(id);
    }));
    this.service.store.release('scheduler', this.owner);
  }
  terminateOwnedWorker(id: string) {
    const child = this.children.get(id); const run = this.service.store.get<Run>('run', id);
    if (!child || run.workerPid !== child.pid || run.leaseOwner !== this.owner) throw new Error('没有属于本宿主的执行进程');
    if(child.exitCode!==null||child.signalCode!==null)return false;
    this.terminate(id,child);return true;
  }
  private terminate(id:string,child:ChildProcess){
    const existing=this.terminations.get(id);if(existing)return existing;
    const operation=terminateOwnedProcessTree(child).catch(()=>false);this.terminations.set(id,operation);
    void operation.then(ok=>{if(!ok)this.reportFailure();});return operation;
  }
  private async workerExited(id:string){
    closeInteractions(this.service.store,id,'worker_exited');
    const pending=this.terminations.get(id);
    const forced=Boolean(pending);
    // Force-stop: mark interrupted as soon as the owned worker exits. Tree confirmation
    // continues below and still blocks acknowledge while terminations is pending.
    if(forced){
      const early=this.service.store.get<Run>('run',id);
      if(isLiveExecution(early.status)&&!early.cancelRequested&&!early.timedOutAt){
        disconnectOwnedMcpTransports(this.service.store, id);
        void stopRecordedSpawnProcesses(dirname(this.service.store.path), early.projectId, id).catch(() => this.reportFailure());
        reopenForceStoppedTools(this.service.store,id);
        this.service.transition(id,'interrupted',{endedAt:new Date().toISOString(),error:'执行进程被强制停止；需要对账'});
        this.service.reconcileInterruptedOperations(id);
      }
    }
    if(pending&&!await pending){
      const current=this.service.store.get<Run>('run',id);
      if(isLiveExecution(current.status)){
        reopenForceStoppedTools(this.service.store,id);
        this.service.transition(id,'interrupted',{endedAt:new Date().toISOString(),error:'执行进程已退出，但进程树清理未确认；保留环境占用，需要核对子进程'});
        this.service.reconcileInterruptedOperations(id);
      }else if(current.status==='interrupted'&&!current.error?.includes('进程树清理未确认')){
        this.service.store.update<Run>('run',current.id,current.revision,{error:'执行进程已退出，但进程树清理未确认；保留环境占用，需要核对子进程'});
      }
      throw new Error('执行进程树清理未确认，保留环境占用');
    }
    if(!this.children.has(id))return;
    this.children.delete(id);this.terminations.delete(id);this.plugins?.gate.releaseRead(id);
    const current=this.service.store.get<Run>('run',id);
    if(isLiveExecution(current.status)){
      disconnectOwnedMcpTransports(this.service.store, id);
      void stopRecordedSpawnProcesses(dirname(this.service.store.path), current.projectId, id).catch(() => this.reportFailure());
      if(current.cancelRequested||current.timedOutAt)this.finish(id,false,current.timedOutAt?'execution_timeout':undefined);
      else this.service.transition(id,'interrupted',{endedAt:new Date().toISOString(),error:'执行进程意外退出；需要对账'});
      this.service.reconcileInterruptedOperations(id);
    }
  }
  acknowledge(id: string) {
    const run = this.service.store.get<Run>('run', id); if (run.status !== 'interrupted') throw new Error('运行未中断');
    if(this.children.has(id)||this.terminations.has(id))throw new Error('执行进程或进程树清理仍未确认，不能仅凭worker PID消失对账');
    requireToolReconciliation(this.service.store,id);
    for (const assetId of run.resultAssetIds) this.service.assets.read(this.service.store.get<Asset>('asset', assetId));
    if (run.workerPid) {
      try { process.kill(run.workerPid, 0); throw new Error('登记的 PID 仍存在，先核对归属并停止原执行'); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
    }
    if (run.mode === 'node') throw new Error('电脑执行需节点回执对账，不能直接确认');
    return this.service.store.transaction(()=>{
      const next=this.service.store.update<Run>('run', id, run.revision, { error: '进程已不存在，资产已对账；允许新尝试' });
      this.service.store.event('run.reconciled',{id},{projectId:run.projectId,runId:id});return next;
    });
  }
}
import {imageAttachments} from './image-attachments.js';

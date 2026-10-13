import { nativePiTools } from '../shared/pi-tools.js';
import { researchRequest, researchGoal } from './research.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { join, resolve, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Asset, Draft, Entity, LocalNode, Memory, Operation, Policy, Project, ProjectSummary, Run, Snapshot, Task,SessionBinding } from '../shared/contracts.js';
import { Store, AppError } from './store.js';
import { Assets } from './assets.js';
import { Auth, hashToken } from './auth.js';
import { Service, text, fingerprint } from './service.js';
import { Scheduler } from './scheduler.js';
import { config, modelConfigured } from './config.js';
import { StorageCapacity, type StorageLimits } from './storage.js';
import { BoundedLog } from './bounded-log.js';
import { ChatGPTAuth, type ChatGPTOptions } from './chatgpt-auth.js';
import { ModelAccess } from './model-access.js';
import { loadPi } from './pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { AutomaticBackup, type BackupOptions } from './automatic-backup.js';
export async function body(req: IncomingMessage, limit = 256_000): Promise<Buffer> {
  const parts: Buffer[] = []; let total = 0;
  for await (const chunk of req) { total += chunk.length; if (total > limit) throw new AppError(413, '请求内容过大'); parts.push(chunk); }
  return Buffer.concat(parts);
}
async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
  try { const value = JSON.parse((await body(req)).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError(400, '请求格式不正确'); }
}
const reply = (res: ServerResponse, data: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const strings = (v: unknown): string[] => { if (!Array.isArray(v) || v.length > 100 || !v.every(s => typeof s === 'string')) throw new AppError(400, '列表格式无效'); return v; };
const revision = (v: unknown) => { if (!Number.isSafeInteger(v) || Number(v) < 1) throw new AppError(400, '需要有效版本号'); return Number(v); };
export function createApp(options: { dataDir?: string; password?: string; schedule?: boolean; launchId?: string; onShutdown?: () => void; storageLimits?: Partial<StorageLimits>; chatgpt?: ChatGPTOptions; backup?:BackupOptions } = {}) {
  const dataDir = options.dataDir ?? config.dataDir; const store = new Store(join(dataDir, 'workbench.sqlite'));
  const capacity = new StorageCapacity(dataDir, { ...config.storageLimits, ...options.storageLimits }); store.attachCapacity(capacity);
  const assets = new Assets(store, dataDir, capacity.limits.assetsBytes); const auth = new Auth(store, dataDir, options.password ?? config.password);
  const chatgpt = new ChatGPTAuth(capacity,{...options.chatgpt,sessionValid:hash=>auth.valid(hash),transferIdle:()=>!store.list<Run>('run').some(r=>r.mode==='pi'&&(['queued','running','waiting_user','waiting_node'].includes(r.status)||(r.status==='interrupted'&&!r.error?.includes('已对账'))))}); const modelAccess = new ModelAccess(chatgpt,store);
  const log = new BoundedLog(capacity); const service = new Service(store, assets); const scheduler = new Scheduler(service, () => log.record('scheduler_failure'),modelAccess);
  log.record('service_started');
  const automaticBackup=new AutomaticBackup(store,scheduler,dataDir,{root:config.backupDir,offsite:config.offsite,...options.backup});
  let shuttingDown = false;
  const snapshot = (): Snapshot => {const m=modelAccess.settings();return ({ projects: store.list('project'), summaries: store.list('summary'), tasks: store.list('task'), runs: store.list('run'), assets: store.list<Asset>('asset').filter(a => a.status === 'ready'), memories: store.list<Memory>('memory').filter(m => !m.deleted), drafts: store.list('draft'), inbox: store.list('inbox'), nodes: store.list('node'), operations: store.list<Operation>('operation').map(o => ({ id: o.id, revision: o.revision, runId: o.runId, projectId: o.projectId, name: o.name, state: o.state, error: o.error })), cursor: store.cursor(), config: { modelConfigured: m.modelConfigured, model: m.binding.model || '尚未配置', authMode:m.binding.kind,limitScope:m.limitScope,callsRemaining:m.callsRemaining, budgetUsd:m.budgetUsd, concurrentLimit: 1, deployment: config.origin.startsWith('https://') ? 'remote' : 'local' } });};
  const policy = (projectId: string, mode: Run['mode']): Policy => {const m=modelAccess.settings();return ({ version: mode === 'pi' ? 8 : 5, projectId, toolNames: [...(mode === 'pi' ? nativePiTools : []), 'read_asset', 'search_assets', 'update_asset_metadata', 'write_asset', 'search_memory', 'propose_memory', 'read_project_summary', 'write_project_summary', 'create_draft', 'capture_source'], allowedHosts: ['raw.githubusercontent.com', 'api.github.com', 'github.com'], allowModel: mode === 'pi' && m.modelConfigured,modelBinding:mode==='pi'?m.binding:undefined, maxCalls:m.maxCalls, maxCostUsd:m.budgetUsd, reservePerCallUsd:m.reservePerCallUsd, maxOutputTokens: config.maxOutputTokens, timeoutMs:m.timeoutMs });};
  const nodeAuth = (req: IncomingMessage) => {
    const nodeId = req.headers['x-node-id']; const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (typeof nodeId !== 'string' || !token) throw new AppError(401, '节点认证失败');
    const record = store.db.prepare('SELECT hash FROM node_tokens WHERE node_id=?').get(nodeId);
    if (!record || record.hash !== hashToken(token)) throw new AppError(401, '节点认证失败');
    const node = store.get<LocalNode>('node', nodeId); if (node.revoked) throw new AppError(401, '节点已撤销'); return node;
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const url = new URL(req.url || '/', 'http://localhost'); const path = url.pathname; const method = req.method;
    try {
      if (path === '/api/health' && method === 'GET') return reply(res, { ready: !shuttingDown, pid: process.pid, instanceId: scheduler.owner, launchId: options.launchId ?? '' });
      // Enforce same-origin writes. Node uses a separate authenticated bearer route.
      if (!['GET', 'HEAD'].includes(method || '') && !path.startsWith('/api/node/')) {
        const origin = req.headers.origin;
        const configuredOrigin = new URL(config.origin);
        const localDevelopment = configuredOrigin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(configuredOrigin.hostname);
        const allowed = localDevelopment ? [config.origin, 'http://127.0.0.1:4311'] : [config.origin];
        if (origin && !allowed.includes(origin)) throw new AppError(403, '来源不被允许');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, '跨站请求被拒绝');
      }
      if (path === '/api/auth' && method === 'GET') { let loggedIn = false; try { auth.require(req); loggedIn = true; } catch {} return reply(res, { loggedIn, configured: auth.configured() }); }
      if (path === '/api/login' && method === 'POST') {
        const data = await json(req); const token = auth.login(text(data.password, '密码', 200), req.socket.remoteAddress || 'local');
        res.setHeader('Set-Cookie', `wb_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${config.origin.startsWith('https://') ? '; Secure' : ''}`); return reply(res, { ok: true });
      }
      if (path.startsWith('/api/node/')) {
        const node = nodeAuth(req);
        if (path === '/api/node/poll' && method === 'POST') {
          const current = store.update<LocalNode>('node', node.id, node.revision, { lastSeen: Date.now() });
          const data = await json(req); const reportedRunId = typeof data.runId === 'string' ? data.runId : undefined;
          if (reportedRunId) { const run = store.get<Run>('run', reportedRunId); if (run.nodeId === node.id && run.status === 'running') store.update<Run>('run', run.id, run.revision, { leaseUntil: Date.now() + 15_000 }); }
          const run = store.list<Run>('run').find(r => r.nodeId === node.id && r.status === 'running' && current.projectIds.includes(r.projectId));
          return reply(res, { run: run ? { id: run.id, projectId: run.projectId, cancelRequested: run.cancelRequested, leaseUntil: run.leaseUntil, operation: 'trusted_note' } : null });
        }
        if (path === '/api/node/result' && method === 'POST') {
          const data = await json(req); const run = store.get<Run>('run', text(data.runId, 'Run'));
          if (run.nodeId !== node.id || !node.projectIds.includes(run.projectId)) throw new AppError(403, '节点超出许可范围');
          const normalized = text(data.content, '成果');
          // Receipt content is a file, so validation must not alter its bytes.
          const content = data.content as string;
          if (!['running', 'interrupted', 'completed', 'cancelled'].includes(run.status)) throw new AppError(409, '节点任务尚未开始');
          const receiptKey = `node-result:${run.id}`;
          const previous = store.db.prepare('SELECT digest FROM commands WHERE key=?').get(receiptKey);
          const legacyDigest = fingerprint({ content: normalized });
          // Existing receipts used trimmed text. Preserve their replay contract
          // without rewriting old assets; version new digests for exact content.
          const receiptDigest = previous?.digest === legacyDigest ? legacyDigest : fingerprint({ receiptVersion: 2, content });
          const result = store.command(receiptKey, receiptDigest, () => {
            const asset = assets.write(run.projectId, '电脑节点验证.md', 'text/markdown', content, run.id);
            const fresh = store.get<Run>('run', run.id); const next = store.update<Run>('run', run.id, fresh.revision, { resultAssetIds: [...fresh.resultAssetIds, asset.id] });
            if (run.status === 'running') scheduler.finish(run.id, true);
            else if (run.status === 'interrupted') store.update<Run>('run', run.id, next.revision, { error: '节点回执与资产已对账；允许新尝试' });
            return { assetId: asset.id, reconciled: true };
          }); return reply(res, result);
        }
        if (path === '/api/node/stopped' && method === 'POST') {
          const data = await json(req); const run = store.get<Run>('run', text(data.runId, 'Run'));
          if (run.nodeId !== node.id || !node.projectIds.includes(run.projectId)) throw new AppError(403, '节点超出许可');
          if (run.status === 'running' && run.cancelRequested) scheduler.finish(run.id, false);
          return reply(res, { stopped: store.get<Run>('run', run.id).status === 'cancelled' });
        }
        throw new AppError(404, '节点接口不存在');
      }
      if (path.startsWith('/api/')) {
        const sessionHash = auth.require(req);
        if(path.startsWith('/api/chatgpt/')) {
          if(path.startsWith('/api/chatgpt/transfer/')&&method==='POST'){
            const data=await json(req);
            if(path==='/api/chatgpt/transfer/recipient')return reply(res,await chatgpt.transfer.prepareRecipient());
            if(path==='/api/chatgpt/transfer/begin')return reply(res,await chatgpt.transfer.begin(data.recipient,text(data.connectionId,'连接ID',256)));
            if(path==='/api/chatgpt/transfer/accept')return reply(res,await chatgpt.transfer.accept(data.bundle,text(data.sourceHostId,'来源主机',256)));
            if(path==='/api/chatgpt/transfer/finalize')return reply(res,await chatgpt.transfer.finalize(data.receipt));
          }
          if(path==='/api/chatgpt/status' && method==='GET')return reply(res,{...chatgpt.status(),callsRemaining:modelAccess.settings().callsRemaining});
          if(path==='/api/chatgpt/start' && method==='POST') {
            const originHost=new URL(config.origin).hostname;
            if(!['127.0.0.1','localhost'].includes(originHost) || !['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress || ''))throw new AppError(403,'请在运行工作台的电脑上完成订阅登录；远程凭据迁移另行配置');
            if(store.list<Run>('run').some(r=>r.mode==='pi'&&r.status==='running'))throw new AppError(409,'先结束当前模型任务，再更改连接');
            return reply(res,await chatgpt.start(sessionHash));
          }
          if(path==='/api/chatgpt/cancel'&&method==='POST'){chatgpt.cancel(sessionHash);return reply(res,{cancelled:true});}
          if(path==='/api/chatgpt/models'&&method==='POST') {
            return reply(res,await chatgpt.listModels());
          }
          if(path==='/api/chatgpt/automatic'&&method==='POST') {
            if(store.list<Run>('run').some(r=>r.mode==='pi'&&r.status==='running'))throw new AppError(409,'先结束当前模型任务，再更改设置');
            const result=await chatgpt.useAutomatic();store.event('model.connection.updated',{kind:'chatgpt',enabled:true,limitsMode:'automatic'});return reply(res,result);
          }
          if(path==='/api/chatgpt/welcome'&&method==='POST')return reply(res,await chatgpt.acknowledgeWelcome());
          if(path==='/api/chatgpt/configure'&&method==='POST') {
            if(store.list<Run>('run').some(r=>r.mode==='pi'&&r.status==='running'))throw new AppError(409,'先结束当前模型任务，再更改设置');
            const data=await json(req);const pi=await loadPi();const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});const model=text(data.model,'模型',180);if(!runtime.getModel('openai',model))throw new AppError(400,'固定Pi版本尚不兼容此模型');
            const result=await chatgpt.configure({model,maxCalls:Number(data.maxCalls),timeoutMs:Number(data.timeoutMs),consent:data.consent===true});store.event('model.connection.updated',{kind:'chatgpt',enabled:true});return reply(res,result);
          }
          if(path==='/api/chatgpt/disconnect'&&method==='POST') {const result=await chatgpt.disconnect();for(const run of store.list<Run>('run').filter(r=>r.policy.modelBinding?.kind==='chatgpt'&&['running','queued','waiting_user'].includes(r.status)))service.cancel(run.id);store.event('model.connection.updated',{kind:'chatgpt',enabled:false});return reply(res,result);}
          throw new AppError(404,'模型连接接口不存在');
        }
        if (path === '/api/service/shutdown' && method === 'POST') {
          const data = await json(req);
          if (!options.onShutdown) throw new AppError(503, '当前实例不支持远程停止');
          if (data.instanceId !== scheduler.owner || shuttingDown) throw new AppError(409, '服务实例已改变或正在停止');
          // The launcher logs in only to authenticate this stop. Retire that
          // temporary session before exiting so routine restarts do not consume
          // the browser device limit. Ordinary browser sessions stay signed in.
          if (data.ephemeralSession === true) auth.revoke(sessionHash);
          shuttingDown = true; log.record('service_stopping'); reply(res, { stopping: true }, 202); setTimeout(options.onShutdown, 100); return;
        }
        if (path === '/api/storage' && method === 'GET') return reply(res, { ...capacity.usage(), log: log.status() });
        if (path === '/api/backup/status' && method === 'GET') return reply(res,automaticBackup.status());
        if (path === '/api/logout' && method === 'POST') { auth.revoke(sessionHash); res.setHeader('Set-Cookie', 'wb_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'); return reply(res, { ok: true }); }
        if (path === '/api/sessions' && method === 'GET') return reply(res, store.db.prepare('SELECT hash,created,expires FROM sessions').all().map(s => ({ ...s, current: s.hash === sessionHash })));
        if (path === '/api/sessions/revoke' && method === 'POST') { const data = await json(req); auth.revoke(text(data.hash, '会话')); return reply(res, { ok: true }); }
        if (path === '/api/snapshot' && method === 'GET') return reply(res, snapshot());
        if (path === '/api/diagnostics' && method === 'GET') {
          res.setHeader('Content-Disposition', 'attachment; filename="diagnostics.json"');
          return reply(res, { at: new Date().toISOString(), runtime: process.version, platform: process.platform, storage: capacity.usage(), service: { pid: process.pid, instanceId: scheduler.owner, cwd: process.cwd(), port: config.port }, model: { configured: modelAccess.settings().modelConfigured, kind:modelAccess.settings().binding.kind, provider:modelAccess.settings().binding.provider, id:modelAccess.settings().binding.model, keyPresent:modelAccess.settings().binding.kind === "api" && Boolean(config.apiKey), maxCalls:modelAccess.settings().maxCalls, budgetUsd:modelAccess.settings().binding.kind === "api" ? config.budgetUsd : undefined }, runs: store.list<Run>('run').map(r => ({ id: r.id, projectId: r.projectId, status: r.status, mode: r.mode, attempt: r.attempt, workerPid: r.workerPid, workerStartedAt: r.workerStartedAt, leaseOwner: r.leaseOwner, leaseUntil: r.leaseUntil, calls: r.calls, spentUsd: r.spentUsd, error: r.error, sessionBound:store.list<SessionBinding>('session_binding').some(b=>b.runId===r.id&&b.sessionId===r.sessionId&&b.sessionPath===r.sessionPath) })), nodes: store.list<LocalNode>('node'), operations: store.list('operation').map(o => ({ id: o.id, revision: o.revision })), includesSecrets: false });
        }
        if (path === '/api/events' && method === 'GET') {
          const cursor = Number(req.headers['last-event-id'] || url.searchParams.get('after') || 0); if (!Number.isSafeInteger(cursor) || cursor < 0) throw new AppError(400, '事件游标无效');
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); let after = cursor;
          const flush = () => { if (!auth.valid(sessionHash)) return res.end(); for (const event of store.events(after)) { res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`); after = event.sequence; } res.write(': heartbeat\n\n'); };
          flush(); const timer = setInterval(flush, 1000); req.on('close', () => clearInterval(timer)); return;
        }
        if (path.match(/^\/api\/projects\/[^/]+\/summary$/)) {
          const projectId = path.split('/')[3];
          if (method === 'GET') return reply(res, service.summary(projectId) ?? null);
          if (method === 'PUT') {
            const data = await json(req); if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0) throw new AppError(400, '摘要版本无效');
            return reply(res, service.saveSummary(projectId, Number(data.revision), { goal: data.goal as string, progress: data.progress as string, decisions: data.decisions as string, nextStep: data.nextStep as string, sourceIds: strings(data.sourceIds) }, true));
          }
        }
        if (path.match(/^\/api\/projects\/[^/]+\/conversation$/) && method === 'GET') {
          const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
          if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new AppError(400, '对话游标无效');
          return reply(res, service.conversation(path.split('/')[3], before));
        }
        if (path === '/api/projects' && method === 'POST') { const data = await json(req); return reply(res, service.createProject(text(data.name, '名称', 100), typeof data.description === 'string' ? data.description.slice(0, 3000) : ''), 201); }
        if (path.match(/^\/api\/projects\/[^/]+\/assets\/search$/) && method === 'GET') {
          const projectId=path.split('/')[3];service.project(projectId);const controller=new AbortController();const abort=()=>controller.abort();res.once('close',abort);
          try{const result=await assets.searchIndex.searchAsync(projectId,url.searchParams.get('q')||'',Number(url.searchParams.get('offset')??0),50,controller.signal,()=>{if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');});if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');return reply(res,result);}finally{res.removeListener('close',abort);}
        }
        if (path.match(/^\/api\/assets\/[^/]+\/metadata$/) && method === 'PATCH') { const data = await json(req); return reply(res, assets.metadata(path.split('/')[3], revision(data.revision), text(data.name, '文件名', 180), strings(data.tags))); }
        if (path === '/api/projects/update' && method === 'POST') { const data = await json(req); const p = store.transaction(() => { const updated = store.update<Project>('project', text(data.id, '项目'), revision(data.revision), { archived: data.archived === true }); store.event('project.updated', updated, { projectId: updated.id }); return updated; }); return reply(res, p); }
        if (path === '/api/tasks' && method === 'POST') {
          const data = await json(req); const projectId = text(data.projectId, '项目'); const mode = data.mode ?? 'pi'; if (!['pi', 'fixture', 'node'].includes(String(mode))) throw new AppError(400, '执行模式无效');
          if (mode === 'pi' && !modelAccess.settings().modelConfigured) throw new AppError(503, '请连接ChatGPT并准备默认模型，或配置获准API；当前可运行工程样例');
          if (mode === 'node') { const node = store.get<LocalNode>('node', text(data.nodeId, '节点')); if (node.revoked || !node.projectIds.includes(projectId)) throw new AppError(403, '节点无此项目权限'); }
          const grant = policy(projectId, mode as Run['mode']);
          if (data.selectedDraftId !== undefined || data.selectedDraftRevision !== undefined) {
            if (typeof data.selectedDraftId !== 'string' || !data.selectedDraftId || !Number.isSafeInteger(data.selectedDraftRevision) || Number(data.selectedDraftRevision) < 1 || data.view !== 'drafts') throw new AppError(400, '当前草稿与版本无效');
            grant.version = mode === 'pi' ? 8 : 6;
            if (mode === 'pi') grant.toolNames.push('read_draft', 'update_draft');
          }
          const research = data.research === undefined ? undefined : researchRequest(data.research);
          if (research) {
            if (mode !== 'pi' || data.selectedDraftId !== undefined || data.selectedDraftRevision !== undefined) throw new AppError(400, '开源研究使用Pi独立任务');
            grant.version = 8;
            grant.toolNames.push('save_research');
          }
          if (mode === 'pi' && data.requestedTools) { const requested = strings(data.requestedTools); if (requested.some(name => !grant.toolNames.includes(name))) throw new AppError(403, '工具请求超出宿主许可'); grant.toolNames = requested; }
          if (mode === 'pi' && data.maxCalls !== undefined) { if (!Number.isSafeInteger(data.maxCalls) || Number(data.maxCalls) < 1 || Number(data.maxCalls) > grant.maxCalls) throw new AppError(400, '调用上限无效'); grant.maxCalls = Number(data.maxCalls); }
          if(data.timeoutMs!==undefined) {if(mode!=='pi'||!Number.isSafeInteger(data.timeoutMs)||Number(data.timeoutMs)<1000||Number(data.timeoutMs)>grant.timeoutMs)throw new AppError(400,'任务时间必须在宿主许可范围内');grant.timeoutMs=Number(data.timeoutMs);}
          if(data.continueFromRunId!==undefined&&mode!=='pi')throw new AppError(400,'只有Pi任务可接续原生会话');
          const continuation=data.continueFromRunId===null?null:data.continueFromRunId!==undefined?text(data.continueFromRunId,'接续任务',120):undefined;
          return reply(res, service.submit(projectId, research ? researchGoal(research) : text(data.goal, '目标'), text(data.commandId, '命令'), mode as Run['mode'], grant, data.assetIds ? strings(data.assetIds) : [], typeof data.nodeId === 'string' ? data.nodeId : undefined, { research, view: research ? 'research' : typeof data.view === 'string' ? data.view : 'project', selectedAssetId: typeof data.selectedAssetId === 'string' ? data.selectedAssetId : undefined, selectedDraftId: data.selectedDraftId as string | undefined, selectedDraftRevision: data.selectedDraftRevision as number | undefined },research ? null : continuation), 202);
        }
        if (path.match(/^\/api\/tasks\/[^/]+\/acceptance$/) && method === 'POST') {
          const data = await json(req); const id = path.split('/')[3]; const task = store.get<Task>('task', id);
          if (!['passed', 'failed', 'needs_review'].includes(String(data.acceptance))) throw new AppError(400, '验收状态无效');
          const run = store.list<Run>('run').filter(r => r.taskId === id).at(-1); if (!run || run.status !== 'completed') throw new AppError(409, '执行结束后再验收');
          for (const assetId of run.resultAssetIds) assets.read(service.scope(store.get<Asset>('asset', assetId), task.projectId));
          const note = text(data.note, '验收依据', 3000);
          const next = store.update<Task>('task', id, revision(data.revision), { acceptance: data.acceptance as Task['acceptance'], acceptanceNote: note, acceptanceSourceIds: run.resultAssetIds }); store.event('task.evaluated', { id, acceptance: next.acceptance }, { projectId: task.projectId, runId: run.id, revision: next.revision }); return reply(res, next);
        }
        if (path.match(/^\/api\/runs\/[^/]+\/(cancel|retry|reconcile)$/) && method === 'POST') {
          const [, , , id, action] = path.split('/'); const data = await json(req);
          if (action === 'cancel') return reply(res, await service.requestCancel(id));
          if (action === 'reconcile') return reply(res, scheduler.acknowledge(id));
          return reply(res, service.retry(id, text(data.commandId, '命令')));
        }
        if (path.match(/^\/api\/operations\/[^/]+\/reconcile$/) && method === 'POST') { const data = await json(req); if (typeof data.performed !== 'boolean') throw new AppError(400, '需要确认操作是否已执行'); return reply(res, service.resolveOperation(path.split('/')[3], revision(data.revision), data.performed, text(data.evidence, '核对依据'))); }
        if (path === '/api/uploads' && method === 'POST') {
          const data = await json(req); const projectId = text(data.projectId, '项目'); service.project(projectId);
          const sourceIds = data.sourceIds ? strings(data.sourceIds) : []; for (const id of sourceIds) service.scope(store.get<Asset>('asset', id), projectId);
          const parentVersionId = typeof data.parentVersionId === 'string' ? data.parentVersionId : undefined;
          if (parentVersionId) service.scope(store.get<Asset>('asset', parentVersionId), projectId);
          return reply(res, assets.begin(projectId, text(data.name, '文件名', 180), typeof data.mime === 'string' ? data.mime : 'application/octet-stream', sourceIds, { parentVersionId }), 201);
        }
        if (path.match(/^\/api\/uploads\/[^/]+$/) && method === 'PUT') return reply(res, assets.commit(path.split('/')[3], await body(req, 10 * 1024 * 1024), typeof req.headers['x-content-hash'] === 'string' ? req.headers['x-content-hash'] : undefined));
        if (path.match(/^\/api\/uploads\/[^/]+$/) && method === 'GET') return reply(res, store.get('upload', path.split('/')[3]));
        if (path.match(/^\/api\/assets\/[^/]+$/) && method === 'GET') {
          const asset = store.get<Asset>('asset', path.split('/')[3]); const data = assets.read(asset);
          const safeInline = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(asset.mime);
          res.writeHead(200, { 'Content-Type': safeInline ? asset.mime : 'text/plain; charset=utf-8', 'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(asset.name)}`, 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" }); return res.end(data);
        }
        if (path === '/api/trash' && method === 'GET') return reply(res, store.list<Asset>('asset').filter(a => a.status === 'deleted'));
        if (path.match(/^\/api\/assets\/[^/]+$/) && method === 'DELETE') { const data = await json(req); return reply(res, assets.remove(path.split('/')[3], revision(data.revision))); }
        if (path.match(/^\/api\/assets\/[^/]+\/restore$/) && method === 'POST') { const data = await json(req); return reply(res, assets.restore(path.split('/')[3], revision(data.revision))); }
        if (path === '/api/memories' && method === 'POST') { const data = await json(req); const kind = text(data.kind, '类型'); if (!['preference', 'project', 'method', 'temporary', 'inference'].includes(kind)) throw new AppError(400, '记忆类型无效'); return reply(res, service.memory({ text: text(data.text, '记忆'), source: text(data.source, '来源'), kind: kind as Memory['kind'], confirmed: data.confirmed === true, projectId: typeof data.projectId === 'string' ? data.projectId : undefined })); }
        if (path.match(/^\/api\/memories\/[^/]+\/confirm$/) && method === 'POST') { const data = await json(req); return reply(res, service.confirmMemory(path.split('/')[3], revision(data.revision))); }
        if (path.match(/^\/api\/memories\/[^/]+$/) && method === 'PATCH') { const data = await json(req); return reply(res, service.reviseMemory(path.split('/')[3], revision(data.revision), typeof data.text === 'string' ? data.text : undefined, typeof data.active === 'boolean' ? data.active : undefined, typeof data.deleted === 'boolean' ? data.deleted : undefined)); }
        if (path === '/api/drafts' && method === 'POST') { const data = await json(req); return reply(res, service.draft(text(data.projectId, '项目'), text(data.title, '标题'), typeof data.body === 'string' ? data.body : '', data.sourceIds ? strings(data.sourceIds) : [])); }
        if (path.match(/^\/api\/drafts\/[^/]+$/) && method === 'PATCH') { const data = await json(req); return reply(res, service.updateDraft(path.split('/')[3], revision(data.revision), text(data.title, '标题'), typeof data.body === 'string' ? data.body : '')); }
        if (path.match(/^\/api\/drafts\/[^/]+\/export$/) && method === 'GET') {
          const d = store.get<Draft>('draft', path.split('/')[3]); const references = d.sourceIds.map(id => { const asset = service.scope(store.get<Asset>('asset', id), d.projectId); return `- ${asset.name} / ${asset.id} / SHA256 ${asset.hash}`; }).join('\n');
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(d.title)}.md` }); return res.end(`# ${d.title}\n\n${d.body}\n\n## 素材来源\n\n${references || '尚未关联素材'}\n`);
        }
        if (path === '/api/inbox' && method === 'POST') { const data = await json(req); return reply(res, service.inbox(text(data.text, '想法'))); }
        if (path === '/api/inbox/link' && method === 'POST') { const data = await json(req); const projectId = text(data.projectId, '项目'); service.project(projectId); const item = store.update<Entity>('inbox', text(data.id, '收件项'), revision(data.revision), { ...({ status: 'linked', linkedProjectId: projectId } as object) }); store.event('inbox.linked', { id: item.id }, { projectId }); return reply(res, item); }
        if (path === '/api/nodes' && method === 'POST') {
          const data = await json(req); const projectIds = strings(data.projectIds); for (const id of projectIds) service.project(id);
          const paired = store.transaction(() => { const node = store.create<LocalNode>('node', { name: text(data.name, '节点名称', 100), projectIds, capabilities: ['trusted_note'], lastSeen: 0, revoked: false }); const token = randomBytes(32).toString('hex'); store.guardDatabase(256, () => store.db.prepare('INSERT INTO node_tokens VALUES(?,?)').run(node.id, hashToken(token))); store.event('node.paired', { id: node.id }); return {node,token}; }); return reply(res, paired);
        }
        if (path === '/api/nodes/revoke' && method === 'POST') { const data = await json(req); store.transaction(() => { const node = store.get<LocalNode>('node', text(data.id, '节点')); store.update<LocalNode>('node', node.id, node.revision, { revoked: true }); store.event('node.revoked', { id: node.id }); }); return reply(res, { ok: true }); }
        throw new AppError(404, '接口不存在');
      }
      if (!['GET', 'HEAD'].includes(method || '')) throw new AppError(405, '请求方法不支持');
      const root = resolve('dist'); const file = resolve(root, '.' + decodeURIComponent(path));
      if (file !== root && !file.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new AppError(403, '路径不允许');
      const target = existsSync(file) && extname(file) ? file : join(root, 'index.html');
      if (!existsSync(target)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('界面尚未构建，请运行 npm run build'); }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(readFileSync(target));
    } catch (error) { if (!res.headersSent) reply(res, { error: error instanceof AppError ? error.message : '操作失败，请检查本机诊断' }, error instanceof AppError ? error.status : 500); else res.end(); }
  });
  if (options.schedule !== false) {scheduler.start();automaticBackup.start();}
  return { server, store, service, assets, auth, scheduler, chatgpt, modelAccess, automaticBackup, snapshot, close: async () => { await assets.searchIndex.close();await automaticBackup.stop();chatgpt.close();await scheduler.stop(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); } };
}

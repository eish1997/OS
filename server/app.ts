import { nativePiTools } from '../shared/pi-tools.js';
import { WorkbenchConfigurations } from './workbench-config.js';
import { researchRequest, researchGoal } from './research.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { join, resolve, extname } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { isLiveExecution, type Asset, type Conversation, type Draft, type Entity, type LocalNode, type Memory, type Operation, type Policy, type Project, type ProjectSummary, type Run, type Snapshot, type Task, type SessionBinding } from '../shared/contracts.js';
import { Store, AppError } from './store.js';
import {McpCredentials} from './mcp-credentials.js';
import {probeMcpServer} from './mcp-probe.js';
import {oauthAuthProvider,startMcpOAuth} from './mcp-oauth.js';
import {PrivateFiles} from './private-files.js';
import {interactionView} from './plugin-interaction.js';
import type {PluginInteraction,PluginInteractionAnswer,PluginNotice} from '../shared/plugin-interaction.js';
import { Assets } from './assets.js';
import {NativeImports} from './native-imports.js';
import {NativeImportSubmission} from './native-import-submission.js';
import {inheritedSource} from './inherited-source.js';
import { Auth, hashToken } from './auth.js';
import { Service, text, fingerprint } from './service.js';
import { messageChunks } from './run-stream.js';
import { toolExecutions, reconcileTool } from './tool-progress.js';
import { Scheduler } from './scheduler.js';
import { config, modelConfigured } from './config.js';
import { StorageCapacity, type StorageLimits } from './storage.js';
import { BoundedLog } from './bounded-log.js';
import { ChatGPTAuth, type ChatGPTOptions } from './chatgpt-auth.js';
import { ModelAccess } from './model-access.js';
import { loadPi } from './pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { AutomaticBackup, type BackupOptions } from './automatic-backup.js';
import { Plugins } from './plugins.js';
import { PiSettings } from './pi-settings.js';
import { importPiSettingsFile, previewPiSettingsFile } from './pi-settings-preview.js';
import {McpConfigurations} from './mcp-config.js';
import type { PluginAction } from '../shared/plugins.js';
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
export function createApp(options: { dataDir?: string; staticDir?: string; password?: string; schedule?: boolean; launchId?: string; onShutdown?: () => void; storageLimits?: Partial<StorageLimits>; chatgpt?: ChatGPTOptions; backup?:BackupOptions } = {}) {
  const dataDir = options.dataDir ?? config.dataDir; const store = new Store(join(dataDir, 'workbench.sqlite'));
  reconcileUnpublishedSessions(store);
  const capacity = new StorageCapacity(dataDir, { ...config.storageLimits, ...options.storageLimits }); store.attachCapacity(capacity);
  const assets = new Assets(store, dataDir, capacity.limits.assetsBytes); const auth = new Auth(store, dataDir, options.password ?? config.password);
  const nativeImports=new NativeImports(store,dataDir);
  const chatgpt = new ChatGPTAuth(capacity,{...options.chatgpt,sessionValid:hash=>auth.valid(hash),transferIdle:()=>!store.list<Run>('run').some(r=>r.mode==='pi'&&(['queued','running','waiting_interaction','waiting_user','waiting_node'].includes(r.status)||(r.status==='interrupted'&&!r.error?.includes('已对账'))))});
  const piSettings = new PiSettings(store);
  const modelAccess = new ModelAccess(chatgpt,store,()=>piSettings.configuration().apiModel);
  const log = new BoundedLog(capacity); const service = new Service(store, assets);
  const mcp = new McpConfigurations(store);
  const mcpCredentials=new McpCredentials(store);
  const plugins = new Plugins(store, () => scheduler.pluginMaintenanceBlocked(), () => scheduler.owner);
  const scheduler = new Scheduler(service, () => log.record('scheduler_failure'),modelAccess,plugins,mcpCredentials);
  log.record('service_started');
  const automaticBackup=new AutomaticBackup(store,scheduler,dataDir,{root:config.backupDir,offsite:config.offsite,...options.backup});
  let shuttingDown = false;
  const snapshot = (): Snapshot => {const m=modelAccess.settings();return ({ projects: store.list('project'), summaries: store.list('summary'), tasks: store.list('task'), runs: store.list('run'), assets: store.list<Asset>('asset').filter(a => a.status === 'ready'), memories: store.list<Memory>('memory').filter(m => !m.deleted), drafts: store.list('draft'), inbox: store.list('inbox'), nodes: store.list('node'), operations: store.list<Operation>('operation').map(o => ({ id: o.id, revision: o.revision, runId: o.runId, projectId: o.projectId, name: o.name, state: o.state, error: o.error })), cursor: store.cursor(), config: { modelConfigured: m.modelConfigured, model: m.binding.model || '尚未配置', authMode:m.binding.kind,limitScope:m.limitScope,callsRemaining:m.callsRemaining, budgetUsd:m.budgetUsd, concurrentLimit: 1, deployment: config.origin.startsWith('https://') ? 'remote' : 'local' } });};
  const policy = (projectId: string, mode: Run['mode']): Policy => {const m=modelAccess.settings();return ({ version: mode === 'pi' ? 8 : 5, projectId, toolNames: [...(mode === 'pi' ? nativePiTools : []), 'read_asset', 'search_assets', 'update_asset_metadata', 'write_asset', 'search_memory', 'propose_memory', 'read_project_summary', 'write_project_summary', 'create_draft', 'capture_source'], allowedHosts: ['raw.githubusercontent.com', 'api.github.com', 'github.com'], allowModel: mode === 'pi' && m.modelConfigured,modelBinding:mode==='pi'?m.binding:undefined, maxCalls:m.maxCalls, maxCostUsd:m.budgetUsd, reservePerCallUsd:m.reservePerCallUsd, maxOutputTokens: mode==='pi'?piSettings.configuration().maxOutputTokens:config.maxOutputTokens, timeoutMs:m.timeoutMs });};
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
        if (path === '/api/conversations') {
          if (method === 'GET') return reply(res, store.list('conversation', url.searchParams.get('projectId') || undefined));
          if (method === 'POST') { const data = await json(req); return reply(res, service.createConversation(text(data.projectId,'项目'), text(data.title,'对话标题',120), text(data.commandId,'命令',120)), 201); }
        }
        if(path.match(/^\/api\/conversations\/[^/]+\/inherited-history$/)&&method==='GET'){
          const conversation=store.get<Conversation>('conversation',path.split('/')[3]);
          const controller=new AbortController();const stop=()=>controller.abort();res.once('close',stop);
          try{
            const origin=await inheritedSource(store,conversation,controller.signal);
            const query={...origin.input,offset:Number(url.searchParams.get('offset')??0),limit:30,sourceHash:origin.sourceHash,throughEntryId:origin.entryId,detailEntryId:url.searchParams.has('entryId')?text(url.searchParams.get('entryId'),'历史消息',120):undefined,textOffset:Number(url.searchParams.get('textOffset')??0),imageIndex:url.searchParams.has('imageIndex')?Number(url.searchParams.get('imageIndex')):undefined,toolCallIndex:url.searchParams.has('toolCallIndex')?Number(url.searchParams.get('toolCallIndex')):undefined,toolCallsOffset:url.searchParams.has('toolCallsOffset')?Number(url.searchParams.get('toolCallsOffset')):undefined};
            const revalidate=()=>{
              if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');
              if(store.get<Conversation>('conversation',conversation.id).revision!==conversation.revision)throw new AppError(409,'历史来源已变化，请重新读取');origin.validate();
            };
            if(query.imageIndex!==undefined){
              try{await streamNativeImage(query,res,metadata=>{revalidate();res.writeHead(200,{'Content-Type':metadata.mimeType,'Content-Length':metadata.bytes,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});},controller.signal);return res.end();}
              catch(error){if(res.headersSent)res.destroy();throw error;}
            }
            const page=await branchPoints(query,controller.signal);
            if(res.destroyed)return;revalidate();
            return reply(res,page);
          }finally{res.removeListener('close',stop);}
        }
        if (path.match(/^\/api\/conversations\/[^/]+\/messages$/) && method === 'GET') {
          const conversation=store.get<Entity>('conversation',path.split('/')[3]);
          const before=url.searchParams.has('before')?Number(url.searchParams.get('before')):undefined;
          if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw new AppError(400,'对话游标无效');
          return reply(res,service.conversation(conversation.projectId!,before,50,conversation.id));
        }
        if (path === '/api/pi/settings' && method === 'GET') return reply(res, await piSettings.snapshot(modelAccess.settings().binding));
        if (path === '/api/pi/settings/preview' && method === 'POST') { const data = await json(req); return reply(res, previewPiSettingsFile(text(data.path, '设置文件', 1000))); }
        if (path === '/api/pi/settings/import' && method === 'POST') { const data = await json(req); return reply(res, await importPiSettingsFile(text(data.path, '设置文件', 1000), piSettings, modelAccess.settings().binding, data.revision)); }
        if(path==='/api/mcp/credentials'&&method==='GET')return reply(res,mcpCredentials.status(url.searchParams.has('projectId')?text(url.searchParams.get('projectId'),'项目',120):undefined));
        if(path==='/api/mcp/credentials'&&method==='PUT'){
          const data=await json(req);return reply(res,mcpCredentials.update(data.projectId===undefined?undefined:text(data.projectId,'项目',120),data.revision as number,text(data.name,'凭据名称',84),data.value as string|null));
        }
        if(path==='/api/mcp/configuration'&&method==='GET'){
          const projectId=url.searchParams.has('projectId')?text(url.searchParams.get('projectId'),'项目',120):undefined;
          const configuration={global:mcp.configuration(),project:projectId?mcp.configuration(projectId):undefined};
          try{return reply(res,{...configuration,effective:mcp.manifest(projectId)});}
          catch(error){if(error instanceof AppError&&error.status===400)return reply(res,{...configuration,diagnostic:error.message});throw error;}
        }
        if(path==='/api/mcp/preview'&&method==='POST'){
          const data=await json(req);return reply(res,await mcp.preview(data.json,data.projectId===undefined?undefined:text(data.projectId,'项目',120)));
        }
        if(path==='/api/mcp/configuration'&&method==='PUT'){
          const data=await json(req);return reply(res,await mcp.update({projectId:data.projectId===undefined?undefined:text(data.projectId,'项目',120),revision:data.revision as number,globalRevision:data.globalRevision as number|undefined,json:data.json as string,source:text(data.source,'配置来源',500),active:data.active as boolean,trusted:data.trusted===true,codemode:data.codemode as boolean,toolSearch:data.toolSearch as boolean}));
        }
        if(path==='/api/mcp/oauth'&&method==='POST'){
          const data=await json(req);
          const projectId=data.projectId===undefined?undefined:text(data.projectId,'项目',120);
          const name=text(data.name,'服务名称',120);
          const manifest=mcpCredentials.resolve(mcp.manifest(projectId),projectId).manifest;
          return reply(res,await startMcpOAuth({manifest,name,files:new PrivateFiles(dataDir,capacity)}));
        }
        if(path==='/api/mcp/probe'&&method==='POST'){
          const data=await json(req);
          const projectId=data.projectId===undefined?undefined:text(data.projectId,'项目',120);
          const name=text(data.name,'服务名称',120);
          const manifest=mcp.manifest(projectId);
          const resolved=mcpCredentials.resolve(manifest,projectId);
          const cwd=projectId?join(dataDir,'workspaces',projectId):join(dataDir,'mcp-probe');
          mkdirSync(cwd,{recursive:true});
          const entry=resolved.manifest.servers.find(server=>server.name===name);
          const authProvider=entry?await oauthAuthProvider(new PrivateFiles(dataDir,capacity),entry):undefined;
          return reply(res,await probeMcpServer({manifest:resolved.manifest,name,cwd,environment:{...process.env,...resolved.environment},authProvider}));
        }
        if (path === '/api/pi/settings' && method === 'PUT') { const data = await json(req); return reply(res, await piSettings.update(data.revision, data.thinkingLevel, modelAccess.settings().binding, data.executionMode, data.networkIdleTimeoutMs, data.userWaitTimeoutMs, data.maxOutputTokens, data.apiModel)); }
        if (path === '/api/plugins' && method === 'GET') return reply(res, { ...plugins.state.snapshot(), environment: plugins.gate.status() });
        if (path === '/api/plugins/operations' && method === 'POST') {
          const data = await json(req);
          const op = plugins.state.enqueue({ action: text(data.action, '操作') as PluginAction, source: text(data.source, '来源'), revision: revision(data.revision), commandId: text(data.commandId, '操作标识'), trusted: data.trusted === true });
          plugins.tick(); return reply(res, op, 202);
        }
        if (/^\/api\/plugins\/[a-f0-9]{24}$/.test(path) && method === 'PATCH') {
          const data = await json(req); if (typeof data.enabled !== 'boolean') throw new AppError(400, '需要插件启用状态');
          return reply(res, plugins.state.configure(revision(data.revision), path.split('/')[3], data.enabled, data.resourceIds === undefined ? undefined : strings(data.resourceIds)));
        }
        if (path === '/api/workbench/config') {
          const configurations = new WorkbenchConfigurations(store);
          if (method === 'GET') return reply(res, configurations.read());
          if (method === 'PUT') { const data = await json(req); return reply(res, configurations.save(data.revision, data.layout)); }
        }
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
            if(store.list<Run>('run').some(r=>r.mode==='pi'&&isLiveExecution(r.status)))throw new AppError(409,'先结束当前模型任务，再更改连接');
            return reply(res,await chatgpt.start(sessionHash));
          }
          if(path==='/api/chatgpt/cancel'&&method==='POST'){chatgpt.cancel(sessionHash);return reply(res,{cancelled:true});}
          if(path==='/api/chatgpt/models'&&method==='POST') {
            return reply(res,await chatgpt.listModels());
          }
          if(path==='/api/chatgpt/automatic'&&method==='POST') {
            if(store.list<Run>('run').some(r=>r.mode==='pi'&&isLiveExecution(r.status)))throw new AppError(409,'先结束当前模型任务，再更改设置');
            const result=await chatgpt.useAutomatic();store.event('model.connection.updated',{kind:'chatgpt',enabled:true,limitsMode:'automatic'});return reply(res,result);
          }
          if(path==='/api/chatgpt/welcome'&&method==='POST')return reply(res,await chatgpt.acknowledgeWelcome());
          if(path==='/api/chatgpt/configure'&&method==='POST') {
            if(store.list<Run>('run').some(r=>r.mode==='pi'&&isLiveExecution(r.status)))throw new AppError(409,'先结束当前模型任务，再更改设置');
            const data=await json(req);const pi=await loadPi();const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});const model=text(data.model,'模型',180);if(!runtime.getModel('openai',model))throw new AppError(400,'固定Pi版本尚不兼容此模型');
            const result=await chatgpt.configure({model,maxCalls:Number(data.maxCalls),timeoutMs:Number(data.timeoutMs),consent:data.consent===true});store.event('model.connection.updated',{kind:'chatgpt',enabled:true});return reply(res,result);
          }
          if(path==='/api/chatgpt/disconnect'&&method==='POST') {const result=await chatgpt.disconnect();for(const run of store.list<Run>('run').filter(r=>r.policy.modelBinding?.kind==='chatgpt'&&['running','waiting_interaction','queued','waiting_user'].includes(r.status)))service.cancel(run.id);store.event('model.connection.updated',{kind:'chatgpt',enabled:false});return reply(res,result);}
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
        if(path.match(/^\/api\/runs\/[^/]+\/native-export$/)&&method==='GET'){
          const projectId=text(url.searchParams.get('projectId'),'项目');const source=service.scope(store.get<Run>('run',path.split('/')[3]),projectId);
          const input=sourceInspection(store,source);
          if(!input||source.mode!=='pi'||!['completed','failed','cancelled','interrupted'].includes(source.status))throw new AppError(409,'执行结束后才能导出原生会话');
          const controller=new AbortController();const stop=()=>controller.abort();res.once('close',stop);
          try{
            await streamNativeExport({...input,offset:0,limit:30},res,metadata=>{
              if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');
              if(store.get<Run>('run',source.id).revision!==source.revision)throw new AppError(409,'来源执行已变化，请重新导出');
              res.writeHead(200,{'Content-Type':metadata.mimeType,'Content-Length':metadata.bytes,'Content-Disposition':`attachment; filename="pi-session-${encodeURIComponent(source.id)}.jsonl"`,'X-Content-SHA256':metadata.sha256!,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
            },controller.signal);return res.end();
          }catch(error){if(res.headersSent)res.destroy();throw error;}finally{res.removeListener('close',stop);}
        }
        if(path.match(/^\/api\/runs\/[^/]+\/branch-points$/)&&method==='GET'){
          const projectId=text(url.searchParams.get('projectId'),'项目');
          const source=service.scope(store.get<Run>('run',path.split('/')[3]),projectId);
          const input=sourceInspection(store,source);
          if(source.mode!=='pi'||!input||!['completed','failed','cancelled','interrupted'].includes(source.status))throw new AppError(409,'原会话尚不可读取历史节点');
          const controller=new AbortController();const stop=()=>controller.abort();res.once('close',stop);
          try{
            const page=await branchPoints({...input,offset:Number(url.searchParams.get('offset')??0),limit:Number(url.searchParams.get('limit')??30),sourceHash:url.searchParams.get('sourceHash')??undefined},controller.signal);
            if(res.destroyed)return;if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');
            const current=store.get<Run>('run',source.id);
            if(current.revision!==source.revision)throw new AppError(409,'执行状态已变化，请重新读取历史节点');
            return reply(res,page);
          }finally{res.removeListener('close',stop);}
        }
        if(path.match(/^\/api\/runs\/[^/]+\/branch$/)&&method==='POST'){
          const data=await json(req);const sourceId=path.split('/')[3];const projectId=text(data.projectId,'项目');
          const commandId=text(data.commandId,'命令ID',120),digest=fingerprint({sourceId,data}),key=`api-branch:v1:${commandId}`;
          const receipt=store.commandReceipt<ReturnType<typeof service.branchConversation>>(key,digest);if(receipt)return reply(res,receipt.value,202);
          const source=service.scope(store.get<Run>('run',sourceId),projectId);
          if(!modelAccess.settings().modelConfigured)throw new AppError(503,'请先连接获准模型');
          const grant=policy(projectId,'pi');if(grant.modelBinding)grant.piRuntime=await piSettings.freeze(grant.modelBinding);
          if(grant.piRuntime?.executionMode==='long')grant.timeoutMs=30*60*1000;
          const controller=new AbortController();const stop=()=>controller.abort();res.once('close',stop);
          try{await prepareSource(store,source,controller.signal);}finally{res.removeListener('close',stop);}
          if(res.destroyed)return;if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');
          return reply(res,store.command(key,digest,()=>service.branchConversation(projectId,sourceId,text(data.entryId,'历史节点',120),text(data.sourceHash,'原会话校验值',64),text(data.title,'新话题名称',120),text(data.goal,'目标'),commandId,grant)),202);
        }
        if (path === '/api/tasks' && method === 'POST') {
          const data = await json(req); const projectId = text(data.projectId, '项目'); const mode = data.mode ?? 'pi'; if (!['pi', 'fixture', 'node'].includes(String(mode))) throw new AppError(400, '执行模式无效');
          if (data.sessionAction !== undefined && (data.sessionAction !== 'compact' || mode !== 'pi' || typeof data.continueFromRunId !== 'string' || !data.continueFromRunId || data.research !== undefined || data.selectedDraftId !== undefined)) throw new AppError(400, '手动压缩参数无效');
          if (data.compactionFocus !== undefined && data.sessionAction !== 'compact') throw new AppError(400, '压缩重点只能用于手动压缩');
          const compactionFocus = data.compactionFocus === undefined ? undefined : text(data.compactionFocus, '压缩重点', 2000);
          // A transport retry replays the accepted request, not today's mutable settings.
          const receiptKey = `api-task:v1:${text(data.commandId, '命令', 120)}`;
          const receiptDigest = fingerprint(data);
          const receipt = store.commandReceipt<{ task: Task; run: Run }>(receiptKey, receiptDigest);
          if (receipt) return reply(res, receipt.value, 202);
          if (mode === 'pi' && !modelAccess.settings().modelConfigured) throw new AppError(503, '请连接ChatGPT并准备默认模型，或配置获准API；当前可运行工程样例');
          if (mode === 'node') { const node = store.get<LocalNode>('node', text(data.nodeId, '节点')); if (node.revoked || !node.projectIds.includes(projectId)) throw new AppError(403, '节点无此项目权限'); }
          const grant = policy(projectId, mode as Run['mode']);
          if (mode === 'pi' && grant.modelBinding) grant.piRuntime = await piSettings.freeze(grant.modelBinding);
          if(mode==='pi'&&data.assetIds)await imageAttachments(store,assets,projectId,strings(data.assetIds),(await piSettings.snapshot(grant.modelBinding)).model?.supportsImages===true);
          if (grant.piRuntime?.executionMode === 'long') grant.timeoutMs = 30 * 60 * 1000;
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
          const inspection = new AbortController(); const cancelInspection = () => inspection.abort(); res.once('close', cancelInspection);
          try { await service.prepareSubmission(projectId, mode as Run['mode'], grant, research ? null : continuation, data.conversationId === undefined ? undefined : text(data.conversationId, '对话'), inspection.signal); }
          finally { res.removeListener('close', cancelInspection); }
          if (res.destroyed) return;
          if (!auth.valid(sessionHash)) throw new AppError(401, '请登录工作台');
          return reply(res, store.command(receiptKey, receiptDigest, () => service.submit(projectId, research ? researchGoal(research) : text(data.goal, '目标'), text(data.commandId, '命令'), mode as Run['mode'], grant, data.assetIds ? strings(data.assetIds) : [], typeof data.nodeId === 'string' ? data.nodeId : undefined, { research, view: research ? 'research' : typeof data.view === 'string' ? data.view : 'project', selectedAssetId: typeof data.selectedAssetId === 'string' ? data.selectedAssetId : undefined, selectedDraftId: data.selectedDraftId as string | undefined, selectedDraftRevision: data.selectedDraftRevision as number | undefined },research ? null : continuation, data.conversationId === undefined ? undefined : text(data.conversationId, '对话'), data.sessionAction === 'compact' ? 'compact' : undefined, compactionFocus)), 202);
        }
        if (path.match(/^\/api\/tasks\/[^/]+\/acceptance$/) && method === 'POST') {
          const data = await json(req); const id = path.split('/')[3]; const task = store.get<Task>('task', id);
          if (!['passed', 'failed', 'needs_review'].includes(String(data.acceptance))) throw new AppError(400, '验收状态无效');
          const run = store.list<Run>('run').filter(r => r.taskId === id).at(-1); if (!run || run.status !== 'completed') throw new AppError(409, '执行结束后再验收');
          for (const assetId of run.resultAssetIds) assets.read(service.scope(store.get<Asset>('asset', assetId), task.projectId));
          const note = text(data.note, '验收依据', 3000);
          const next = store.update<Task>('task', id, revision(data.revision), { acceptance: data.acceptance as Task['acceptance'], acceptanceNote: note, acceptanceSourceIds: run.resultAssetIds }); store.event('task.evaluated', { id, acceptance: next.acceptance }, { projectId: task.projectId, runId: run.id, revision: next.revision }); return reply(res, next);
        }
        if(path.match(/^\/api\/runs\/[^/]+\/tools$/)&&method==='GET')return reply(res,toolExecutions(store,path.split('/')[3],Number(url.searchParams.get('after')??0)));
        if(path.match(/^\/api\/runs\/[^/]+\/messages\/[^/]+\/text$/)&&method==='GET'){
          const runId=path.split('/')[3];const messageId=decodeURIComponent(path.split('/')[5]);
          let chunks=messageChunks(store,runId,messageId);
          res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
          while(chunks.length&&!res.destroyed){
            for(const chunk of chunks){
              if(res.destroyed)break;
              if(!res.write(chunk.text))await new Promise<void>(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});
            }
            const after=chunks.at(-1)!.chunk;
            await new Promise<void>(resolve=>setImmediate(resolve));
            chunks=messageChunks(store,runId,messageId,after);
          }
          res.end();return;
        }
        if (path.match(/^\/api\/runs\/[^/]+\/model-requests$/) && method === 'GET') return reply(res, service.modelRequests(path.split('/')[3], Number(url.searchParams.get('after') ?? 0)));
        if (path.match(/^\/api\/runs\/[^/]+\/budget$/) && method === 'GET') return reply(res, service.taskBudget(path.split('/')[3]));
        if(path.match(/^\/api\/runs\/[^/]+\/steer$/)&&method==='POST'){
          const data=await json(req);return reply(res,scheduler.steer(path.split('/')[3],text(data.conversationId,'话题ID',120),text(data.commandId,'命令ID',120),text(data.text,'指导内容')));
        }
        if(/^\/api\/runs\/[^/]+\/interactions$/.test(path)&&method==='GET'){
          const run=store.get<Run>('run',path.split('/')[3]);
          return reply(res,{interactions:store.list<PluginInteraction>('plugin_interaction',run.projectId).filter(item=>item.runId===run.id).map(item=>interactionView(store,item)),notices:store.list<PluginNotice>('plugin_notice',run.projectId).filter(item=>item.runId===run.id)});
        }
        if(/^\/api\/runs\/[^/]+\/interactions\/[^/]+\/answer$/.test(path)&&method==='POST'){
          const data=await json(req);return reply(res,scheduler.answerDialog(path.split('/')[3],path.split('/')[5],data.revision as number,text(data.commandId,'答复命令ID',120),data.answer as PluginInteractionAnswer));
        }
        if (path.match(/^\/api\/runs\/[^/]+\/(cancel|retry|extend-retry|reconcile)$/) && method === 'POST') {
          const [, , , id, action] = path.split('/'); const data = await json(req);
          if (action === 'cancel') return reply(res, await service.requestCancel(id));
          if (action === 'reconcile') return reply(res, scheduler.acknowledge(id));
          const commandId = text(data.commandId, '命令', 120);
          const addition = action === 'extend-retry' ? { calls: data.calls as number, costUsd: data.costUsd as number, reason: text(data.reason, '追加原因', 500) } : undefined;
          const receipt = store.commandReceipt<Run>(`retry:${commandId}`, fingerprint({ id, addition }));
          if (receipt) return reply(res, receipt.value);
          const inspection = new AbortController(); const cancelInspection = () => inspection.abort(); res.once('close', cancelInspection);
          try { await service.prepareRetry(id, inspection.signal); } finally { res.removeListener('close', cancelInspection); }
          if (res.destroyed) return;
          if (!auth.valid(sessionHash)) throw new AppError(401, '请登录工作台');
          return reply(res, service.retry(id, commandId, addition));
        }
        if(path.match(/^\/api\/runs\/[^/]+\/tools\/[^/]+\/reconcile$/)&&method==='POST'){
          const data=await json(req);if(!['performed','not_performed','partial'].includes(String(data.outcome)))throw new AppError(400,'核对结论无效');
          return reply(res,reconcileTool(store,path.split('/')[3],decodeURIComponent(path.split('/')[5]),revision(data.revision),data.outcome as 'performed'|'not_performed'|'partial',text(data.evidence,'核对依据',4000)));
        }
        if (path.match(/^\/api\/operations\/[^/]+\/reconcile$/) && method === 'POST') { const data = await json(req); if (typeof data.performed !== 'boolean') throw new AppError(400, '需要确认操作是否已执行'); return reply(res, service.resolveOperation(path.split('/')[3], revision(data.revision), data.performed, text(data.evidence, '核对依据'))); }
        if(path.match(/^\/api\/native-imports\/[^/]+\/(prepare|restore)$/)&&method==='POST'){
          const data=await json(req);const projectId=text(data.projectId,'项目');const importId=path.split('/')[3];
          const submissions=new NativeImportSubmission(store,service,nativeImports,async project=>{
            if(!modelAccess.settings().modelConfigured)throw new AppError(503,'请先连接获准模型');
            const grant=policy(project,'pi');if(grant.modelBinding)grant.piRuntime=await piSettings.freeze(grant.modelBinding);
            if(grant.piRuntime?.executionMode==='long')grant.timeoutMs=30*60*1000;
            const manifest=plugins.state.manifest();const resolved=mcpCredentials.resolve(mcp.manifest(project),project).manifest;
            return {policy:grant,pluginSignature:manifest.signature,mcpSignature:resolved.signature,plugins:manifest.packages.map(pkg=>pkg.source),mcpServers:resolved.servers.map(server=>server.name),supportsImages:(await piSettings.snapshot(grant.modelBinding)).model?.supportsImages===true};
          });
          const controller=new AbortController();const stop=()=>controller.abort();res.once('close',stop);
          const validate=()=>{if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');};
          try{
            const result=path.endsWith('/prepare')?await submissions.prepare(projectId,importId,text(data.sha256,'原件校验值',64),text(data.entryId,'历史节点',120),controller.signal,validate):await submissions.submit(projectId,importId,data,controller.signal,validate);
            if(!res.destroyed)return reply(res,result,path.endsWith('/prepare')?200:202);
          }finally{res.removeListener('close',stop);}return;
        }
        if(path==='/api/native-imports'&&method==='GET')return reply(res,nativeImports.list(text(url.searchParams.get('projectId'),'项目')));
        if(path==='/api/native-imports'&&method==='POST'){
          const data=await json(req);if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');
          return reply(res,nativeImports.begin(text(data.projectId,'项目'),text(data.name,'文件名',180),data.bytes as number,text(data.sha256,'校验值',64),text(data.commandId,'命令ID',120)),201);
        }
        if(path.match(/^\/api\/native-imports\/[^/]+(?:\/(?:preview|points))?$/)){
          const projectId=text(url.searchParams.get('projectId'),'项目');const id=path.split('/')[3];
          nativeImports.get(projectId,id);
          if(path.split('/').length===4&&method==='DELETE')return reply(res,nativeImports.cancel(projectId,id));
          if(path.endsWith('/points')&&method==='GET'){
            const controller=new AbortController();const abort=()=>controller.abort();res.once('close',abort);
            try{const result=await nativeImports.points(projectId,id,Number(url.searchParams.get('offset')??0),url.searchParams.get('sourceHash')??undefined,controller.signal);if(res.destroyed)return;if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');return reply(res,result);}finally{res.removeListener('close',abort);}
          }
          if(path.endsWith('/preview')&&method==='GET'){
            const controller=new AbortController();const abort=()=>controller.abort();res.once('close',abort);
            try{const result=await nativeImports.preview(projectId,id,controller.signal);if(res.destroyed)return;if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');return reply(res,result);}finally{res.removeListener('close',abort);}
          }
          if(path.split('/').length===4&&method==='GET')return reply(res,nativeImports.get(projectId,id));
          if(path.split('/').length===4&&method==='PUT'){
            const offset=url.searchParams.get('offset');if(offset===null||!/^\d+$/.test(offset))throw new AppError(400,'需要上传偏移');
            const bytes=await body(req,1024*1024);if(!auth.valid(sessionHash))throw new AppError(401,'请登录工作台');
            return reply(res,nativeImports.write(projectId,id,Number(offset),bytes));
          }
        }
        if (path === '/api/uploads' && method === 'POST') {
          const data = await json(req); const projectId = text(data.projectId, '项目'); service.project(projectId);
          const sourceIds = data.sourceIds ? strings(data.sourceIds) : []; for (const id of sourceIds) service.scope(store.get<Asset>('asset', id), projectId);
          const parentVersionId = typeof data.parentVersionId === 'string' ? data.parentVersionId : undefined;
          if (parentVersionId) service.scope(store.get<Asset>('asset', parentVersionId), projectId);
          const name=text(data.name,'文件名',180),mime=typeof data.mime==='string'?data.mime:'application/octet-stream';
          const expectedHash=data.expectedHash===undefined?undefined:text(data.expectedHash,'内容校验值',64);
          if(expectedHash!==undefined&&!/^[a-f0-9]{64}$/.test(expectedHash))throw new AppError(400,'内容校验值无效');
          const create=()=>assets.begin(projectId,name,mime,sourceIds,{parentVersionId,expectedHash});
          const result=data.commandId===undefined?create():store.command(`upload:v1:${text(data.commandId,'命令ID',120)}`,fingerprint({projectId,name,mime,sourceIds,parentVersionId,expectedHash}),create);
          return reply(res,result,201);
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
      const root = resolve(options.staticDir ?? 'dist'); const file = resolve(root, '.' + decodeURIComponent(path));
      if (file !== root && !file.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new AppError(403, '路径不允许');
      const target = existsSync(file) && extname(file) ? file : join(root, 'index.html');
      if (!existsSync(target)) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('界面尚未构建，请运行 npm run build'); }
      const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(readFileSync(target));
    } catch (error) { if (!res.headersSent) reply(res, { error: error instanceof AppError ? error.message : '操作失败，请检查本机诊断' }, error instanceof AppError ? error.status : 500); else res.end(); }
  });
  if (options.schedule !== false) {scheduler.start();automaticBackup.start();plugins.start();}
  return { server, store, service, assets, auth, scheduler, plugins, mcp, chatgpt, modelAccess, automaticBackup, snapshot, close: async () => { await assets.searchIndex.close();await automaticBackup.stop();await plugins.stop();chatgpt.close();await scheduler.stop(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); } };
}
import {imageAttachments} from './image-attachments.js';
import {prepareSource,sourceInspection,reconcileUnpublishedSessions} from './native-session.js';
import {branchPoints} from './native-branch-points.js';
import {streamNativeImage,streamNativeExport} from './native-image-stream.js';

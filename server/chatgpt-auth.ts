import { createServer, type Server } from 'node:http';
import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import type { ChatGPTConnection } from '../shared/contracts.js';
import { AppError } from './store.js';
import { PrivateFiles } from './private-files.js';
import type { StorageCapacity } from './storage.js';
import { connectionFailure, type OpenAIConnectionDiagnostic } from './openai-error.js';
import { loadPi } from './pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { listenBrowserLoopback } from './browser-port.js';
import {withChatGPTLock} from './chatgpt-lock.js';
import {ChatGPTTransfer,assertChatGPTTransferReady} from './chatgpt-transfer.js';

const issuer = 'https://auth.openai.com';
const resource = 'https://api.openai.com/v1';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const authResponseLimit = 256_000;
// Account catalogs include large instruction/templates that never enter the UI.
const catalogResponseLimit = 2 * 1024 * 1024;
interface Host { schema: 1; id: string; selected: boolean }
export interface Credential {
  schema: 1; connectionId: string; clientId: string; subject: string; email?: string;
  access: string; refresh: string; idToken: string; scopes: string[]; expires: number;
  model: string; enabled: boolean; maxCalls: number; timeoutMs: number;
  limitsMode?: 'automatic' | 'custom'; welcomeSeen?: boolean;
}
interface Pending {
  id: string; sessionHash: string; state: string; nonce: string; verifier: string; redirect: string;
  clientId?: string; previous?: Credential; server: Server; controller: AbortController; timer: ReturnType<typeof setTimeout>;
  used: boolean;
}
export interface ChatGPTOptions { fetch?: typeof fetch; callbackPort?: number; loginTimeoutMs?: number; sessionValid?: (hash: string) => boolean; automaticSetup?: boolean; transferIdle?:()=>boolean }
const opaque = () => randomBytes(32).toString('base64url');
const string = (value: unknown, maximum = 20_000) => { if (typeof value !== 'string' || !value.length || value.length > maximum) throw new AppError(502, '授权响应格式无效'); return value; };
export function validateIdToken(token: string, keys: JsonWebKey[], expected: { clientId: string; nonce?: string; subject?: string; now?: number }) {
  try {
    const parts = token.split('.'); if (parts.length !== 3 || token.length > 20_000) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.crit) throw new Error();
    const candidates = keys.filter(key => (key as JsonWebKey & { kid?: string }).kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
    if (candidates.length !== 1 || !verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), createPublicKey({ key: candidates[0], format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error();
    const now = Math.floor((expected.now ?? Date.now()) / 1000); const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== issuer || !audiences.includes(expected.clientId) || (audiences.length > 1 && claims.azp !== expected.clientId) || (claims.azp && claims.azp !== expected.clientId) || !Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30)) || (claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > now + 30))) throw new Error();
    if (expected.nonce !== undefined && claims.nonce !== expected.nonce) throw new Error();
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256 || (expected.subject && claims.sub !== expected.subject)) throw new Error();
    return { subject: claims.sub as string, email: typeof claims.email === 'string' && claims.email.length <= 320 ? claims.email as string : undefined };
  } catch { throw new AppError(502, '授权身份校验失败，未替换原连接'); }
}
export class ChatGPTAuth {
  readonly transfer:ChatGPTTransfer;
  private readonly files: PrivateFiles;
  private pending?: Pending;
  private starting = false;
  private closed = false;
  private error?: string;
  private diagnostic?: OpenAIConnectionDiagnostic;
  private models: { id: string; name: string }[] = [];
  private catalogConnection?: string;
  private readonly fetcher: typeof fetch;
  constructor(private readonly capacity: StorageCapacity, private readonly options: ChatGPTOptions = {}) {
    this.files = new PrivateFiles(capacity.dataDir, capacity); this.fetcher = options.fetch ?? fetch;
    this.transfer=new ChatGPTTransfer(capacity,this.files,()=>{if(this.closed||this.starting||this.pending||this.options.transferIdle?.()!==true)throw new AppError(409,'先结束授权和模型任务，再迁移订阅会话');});
  }
  private host() {
    const host = this.files.read<Host>('host.json');
    if (host && (host.schema !== 1 || !/^urn:uuid:[0-9a-f-]{36}$/.test(host.id) || typeof host.selected !== 'boolean')) throw new AppError(503, '模型主机记录无效');
    return host;
  }
  private credential() {
    assertChatGPTTransferReady(this.files);
    const c = this.files.read<Credential>('chatgpt.json');
    if (c && (c.schema !== 1 || typeof c.connectionId !== 'string' || typeof c.clientId !== 'string' || c.clientId === 'dynamic_agent_client' || typeof c.subject !== 'string' || typeof c.access !== 'string' || typeof c.refresh !== 'string' || typeof c.idToken !== 'string' || !Array.isArray(c.scopes) || !c.scopes.includes('chatgpt.tokens.use.direct') || !Number.isFinite(c.expires) || !Number.isSafeInteger(c.maxCalls) || c.maxCalls < 0 || c.maxCalls > 1000 || !Number.isFinite(c.timeoutMs) || typeof c.enabled !== 'boolean' || typeof c.model !== 'string' || (c.limitsMode !== undefined && !['automatic','custom'].includes(c.limitsMode)) || (c.welcomeSeen !== undefined && typeof c.welcomeSeen !== 'boolean'))) throw new AppError(503, '模型连接记录无效');
    return c;
  }
  status(): ChatGPTConnection {
    try { const c = this.credential(); return { selected: this.host()?.selected ?? false, connected: Boolean(c), enabled: c?.enabled ?? false, account: c?.email || (c ? '已验证 ChatGPT 账户' : ''), connectionId: c?.connectionId, model: c?.model || '', maxCalls: c?.maxCalls ?? 0, timeoutMs: c?.timeoutMs ?? 120_000, limitsMode:c?.limitsMode ?? 'custom',limitScope:c?.limitsMode==='automatic'?'task':'connection',welcomePending:Boolean(c?.enabled && !c.welcomeSeen),pending: Boolean(this.pending), error: this.error, diagnostic: this.diagnostic }; }
    catch(e) { return { selected: true, connected: false, enabled: false, account: '', model: '', maxCalls: 0, timeoutMs: 120_000, pending: false, error:e instanceof AppError&&e.status===423?e.message:'凭据记录无法读取；未自动覆盖或切换付费API' }; }
  }
  ready() { const c = this.status(); return c.connected && c.enabled && Boolean(c.model) && c.maxCalls > 0; }
  private assertSession(p: Pending) { if (this.pending !== p || p.controller.signal.aborted || this.options.sessionValid?.(p.sessionHash) === false) throw new AppError(401, '发起登录的工作台会话已失效'); }
  private async locked<T>(fn: () => Promise<T>): Promise<T> {
    return withChatGPTLock(this.files,this.capacity,fn);
  }
  private async request(url: string, options: RequestInit = {}, signal?: AbortSignal): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetcher(url, { ...options, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
      const reader = response.body?.getReader(); const chunks: Buffer[] = []; let total = 0;
      const limit = response.ok && url === resource + '/models' ? catalogResponseLimit : authResponseLimit;
      if (reader) try { while (true) { const {done,value} = await reader.read(); if (done) break; total += value.length; if (total > limit) throw new AppError(502, url === resource + '/models' ? '账户模型目录超过安全读取上限，请稍后刷新或更新适配器' : '授权响应超过安全读取上限'); chunks.push(Buffer.from(value)); } } finally { await reader.cancel(); }
      if (!response.ok) { const failure = connectionFailure(url, options, response, Buffer.concat(chunks).toString()); this.diagnostic = failure.diagnostic; this.error = failure.message; throw new AppError([400,401,403,429,500,502,503,504].includes(response.status) ? response.status : 502, failure.message); }
      const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data;
    } catch (e) { if (e instanceof AppError) throw e; throw new AppError(502, 'OpenAI连接未完成，未记录响应中的秘密'); }
  }
  async start(sessionHash: string) {
    if (this.closed) throw new AppError(503, '工作台正在退出，不能开始登录');
    if (this.pending || this.starting) throw new AppError(409, '已有登录正在进行，可先取消');
    const previous = this.credential(); const controller = new AbortController(); this.starting = true;
    const server = createServer((req,res) => {
      res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"); res.setHeader('Content-Type','text/plain; charset=utf-8');
      const p = this.pending;
      const address = server.address(); const host = address && typeof address !== 'string' ? `127.0.0.1:${address.port}` : '';
      if (req.method !== 'GET' || req.headers.host !== host || (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') || (req.url?.length ?? 0) > 24_000) { res.writeHead(400); res.end('回调请求无效'); return; }
      const url = new URL(req.url || '/', `http://${host}`);
      if (url.pathname !== '/auth/callback') { res.writeHead(404); res.end('回调不存在'); return; }
      void this.callback(url, p).then(() => { res.end(this.ready()?'ChatGPT已连接，可以回到工作台直接开始对话。':'ChatGPT登录已成功。请回到工作台查看模型准备状态。'); }).catch(e => { res.writeHead(e instanceof AppError ? e.status : 500); res.end(e instanceof AppError ? e.message : '连接未完成'); });
    });
    await listenBrowserLoopback(server,this.options.callbackPort ?? 0).catch(error=>{this.starting=false;server.close();throw error instanceof AppError?error:new AppError(503,'无法启动本机授权回调');});
    try {
      if (this.closed) throw new AppError(503, '工作台已退出，登录已取消');
      const host = await this.locked(async()=>{const host=this.host() ?? {schema:1 as const,id:`urn:uuid:${randomUUID()}`,selected:false};this.files.save('host.json',{...host,selected:true});return host;});
      if (this.closed) throw new AppError(503, '工作台已退出，登录已取消');
      const redirect = `http://127.0.0.1:${(server.address() as {port:number}).port}/auth/callback`;
      const p: Pending = {id:randomUUID(),sessionHash,state:opaque(),nonce:opaque(),verifier:opaque(),redirect,clientId:previous?.clientId,previous,server,controller,used:false,timer:setTimeout(()=>this.cancelInternal('登录已超时，请重新发起'),this.options.loginTimeoutMs ?? 300_000)};
      this.pending=p; this.error=undefined; this.diagnostic=undefined;
      // Reuse registration without sending the saved ID token through the UI URL.
      const url = new URL(issuer+'/api/accounts/authorize'); url.search = new URLSearchParams({client_id:p.clientId || 'dynamic_agent_client',ext_agent_host_id:host.id,response_type:'code',redirect_uri:redirect,resource,scope,state:p.state,nonce:p.nonce,code_challenge:createHash('sha256').update(p.verifier).digest('base64url'),code_challenge_method:'S256',...(previous?{}:{agent_name_hint:'Personal AI Workbench'})}).toString();
      return {url:url.toString(),attemptId:p.id};
    } catch(e){controller.abort();server.closeAllConnections();server.close();throw e;}
    finally {this.starting=false;}
  }
  private async callback(url: URL, p?: Pending) {
    if (!p) throw new AppError(410,'登录尝试已结束'); this.assertSession(p);
    if(['state','code','client_id','error'].some(name=>url.searchParams.getAll(name).length>1))throw new AppError(400,'登录回调参数重复');
    const returned = url.searchParams.get('state') || ''; const a=Buffer.from(returned);const b=Buffer.from(p.state);
    if(a.length!==b.length || !timingSafeEqual(a,b)) throw new AppError(400,'登录state不匹配');
    if(p.used) throw new AppError(409,'登录回调已使用'); p.used=true;
    try {
      if(url.searchParams.has('error')) throw new AppError(400,'你已取消授权，未更改原连接');
      const supplied=url.searchParams.get('client_id'); const clientId=p.clientId || string(supplied,256);
      if(clientId==='dynamic_agent_client' || (p.clientId && supplied && supplied!==p.clientId)) throw new AppError(400,'登录客户端身份不匹配');
      const code=string(url.searchParams.get('code'),4000);
      await this.locked(async()=>{
        this.assertSession(p); const original=this.credential(); if(original?.connectionId!==p.previous?.connectionId) throw new AppError(409,'原连接已改变，请重新发起');
        const response=await this.request(issuer+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,code_verifier:p.verifier,redirect_uri:p.redirect,resource})},p.controller.signal);
        const idToken=string(response.id_token); const jwks=await this.request(issuer+'/.well-known/jwks.json',{},p.controller.signal);
        if(!Array.isArray(jwks.keys)) throw new AppError(502,'身份公钥响应无效');
        const identity=validateIdToken(idToken,jwks.keys,{clientId,nonce:p.nonce,subject:p.previous?.subject});
        const tokens=this.tokens(response); this.assertSession(p);
        this.files.save('chatgpt.json',{schema:1,connectionId:p.previous?.connectionId || randomUUID(),clientId,...identity,idToken,...tokens,model:p.previous?.model || '',maxCalls:p.previous?.maxCalls || 0,timeoutMs:p.previous?.timeoutMs || 120_000,limitsMode:p.previous?.limitsMode,welcomeSeen:p.previous?.welcomeSeen,enabled:false} satisfies Credential);
        this.models=[];
      });
      if(this.options.automaticSetup!==false) {
        try {
          if(p.previous?.model && p.previous.maxCalls>0 && p.previous.limitsMode!=='automatic') {await this.listModels();await this.configure({model:p.previous.model,maxCalls:p.previous.maxCalls,timeoutMs:p.previous.timeoutMs,consent:true});}
          else await this.useAutomatic(()=>this.assertSession(p));
        } catch(e) {this.error='登录已成功；'+(e instanceof AppError?e.message:'默认模型准备未完成，请重试准备');}
      }
    } catch(e) { this.error=e instanceof AppError?e.message:'登录未完成';throw e; }
    finally { if(this.pending===p){clearTimeout(p.timer);this.pending=undefined; setTimeout(()=>{p.server.closeAllConnections();p.server.close();},50);} }
  }
  private tokens(response: Record<string,unknown>) {
    const access=string(response.access_token);const refresh=string(response.refresh_token); const scopes=string(response.scope,2000).split(/\s+/);
    if(!scope.split(' ').every(s=>scopes.includes(s)) || response.token_type !== 'Bearer' || typeof response.expires_in!=='number' || !Number.isFinite(response.expires_in) || response.expires_in<60 || response.expires_in>31_536_000) throw new AppError(502,'授权未包含完整订阅权限或有效令牌');
    return {access,refresh,scopes,expires:Date.now()+response.expires_in*1000};
  }
  private async refreshed(c: Credential, signal?: AbortSignal): Promise<Credential> {
    if(c.expires>Date.now()+180_000) return c;
    const response=await this.request(issuer+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:c.clientId,refresh_token:c.refresh,resource})},signal);
    const tokens=this.tokens(response); let idToken=c.idToken;
    if(response.id_token!==undefined){idToken=string(response.id_token);const jwks=await this.request(issuer+'/.well-known/jwks.json',{},signal);if(!Array.isArray(jwks.keys))throw new AppError(502,'身份公钥响应无效');validateIdToken(idToken,jwks.keys,{clientId:c.clientId,subject:c.subject});}
    const next={...c,...tokens,idToken}; this.files.save('chatgpt.json',next);return next;
  }
  async access(connectionId: string) {
    return this.locked(async()=>{const c=this.credential();if(!c || !c.enabled || c.connectionId!==connectionId)throw new AppError(403,'订阅连接已停用或改变');return (await this.refreshed(c)).access;});
  }
  async listModels() {
    return this.locked(async()=>{let c=this.credential();if(!c)throw new AppError(409,'请先登录ChatGPT');c=await this.refreshed(c);const response=await this.request(resource+'/models',{headers:{Authorization:`Bearer ${c.access}`}});if(!Array.isArray(response.models))throw new AppError(502,'账户模型目录格式无效');
      const models=response.models.filter((m): m is {slug:string;display_name:string;visibility:string}=>Boolean(m&&typeof m==='object'&&m.visibility==='list'&&typeof m.slug==='string'&&m.slug.length<180&&typeof m.display_name==='string'&&m.display_name.length<200)).map(m=>({id:m.slug,name:m.display_name}));
      const pi=await loadPi();const runtime=await pi.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,allowModelNetwork:false,refreshOnCreate:false});
      this.models=models.slice(0,200).filter(m=>Boolean(runtime.getModel('openai',m.id)));this.catalogConnection=c.connectionId;return this.models;
    });
  }
  async configure(input: {model: string;maxCalls:number;timeoutMs:number;consent:boolean}) {
    if(!input.consent || !Number.isSafeInteger(input.maxCalls) || input.maxCalls<1 || input.maxCalls>1000 || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs<10_000 || input.timeoutMs>300_000)throw new AppError(400,'请确认订阅用量并设置有效调用/时间上限');
    if(!this.models.some(m=>m.id===input.model))throw new AppError(400,'请刷新账户模型目录后选择可用模型');
    await this.locked(async()=>{const c=this.credential();if(!c || c.connectionId!==this.catalogConnection)throw new AppError(409,'账户已改变，请刷新模型目录');this.files.save('chatgpt.json',{...c,...input,limitsMode:'custom',enabled:true,consent:undefined});}); this.error=undefined;this.diagnostic=undefined;return this.status();
  }
  async useAutomatic(beforeSave?:()=>void) {
    const models=await this.listModels();
    const preferred=['gpt-6.1-sol','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna'];
    const model=preferred.find(id=>models.some(m=>m.id===id)) ?? models[0]?.id;
    if(!model)throw new AppError(503,'账户暂无当前Pi兼容模型；可稍后重试准备，不需重新登录');
    await this.locked(async()=>{beforeSave?.();const c=this.credential();if(!c || c.connectionId!==this.catalogConnection || !this.models.some(m=>m.id===model))throw new AppError(409,'账户已改变，请重新准备默认模型');this.files.save('chatgpt.json',{...c,model,limitsMode:'automatic',maxCalls:20,timeoutMs:300_000,enabled:true});});
    this.error=undefined;this.diagnostic=undefined;return this.status();
  }
  async acknowledgeWelcome() {await this.locked(async()=>{const c=this.credential();if(!c)throw new AppError(409,'请先登录ChatGPT');this.files.save('chatgpt.json',{...c,welcomeSeen:true});});return this.status();}
  async disconnect() {
    this.cancelInternal();let previous:Credential|undefined;
    await this.locked(async()=>{previous=this.credential();this.files.remove('chatgpt.json');this.models=[];});
    let revoked=false;
    if(previous) try { const response=await this.fetcher(issuer+'/api/accounts/oauth/revoke',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:previous.clientId,token:previous.refresh,token_type_hint:'refresh_token'})});revoked=response.ok;await response.body?.cancel(); } catch {}
    this.error=revoked||!previous?undefined:'本机已断开；远端撤销未确认，可在ChatGPT设置中撤销授权';return {disconnected:true,remoteRevoked:revoked};
  }
  cancel(sessionHash:string){if(this.pending&&this.pending.sessionHash!==sessionHash)throw new AppError(403,'请在发起登录的浏览器取消');this.cancelInternal('登录已取消');}
  private cancelInternal(error?:string){const p=this.pending;if(p){this.pending=undefined;clearTimeout(p.timer);p.controller.abort();p.server.closeAllConnections();p.server.close();}this.error=error;}
  close(){this.closed=true;this.cancelInternal();}
}

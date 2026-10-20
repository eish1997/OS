import type {ExtensionContext,LoadExtensionsResult} from '@earendil-works/pi-coding-agent';
import type {McpConnectionCode,McpDiagnostic} from '../shared/mcp.js';
import type {Run} from '../shared/contracts.js';
import type {Store} from './store.js';

/** Native notices can contain stderr, URLs and secrets. Persist categories only. */
export function mcpDiagnostics(message:string,names:string[]):McpDiagnostic[]{
  if(message.startsWith('MCP servers are still connecting'))return [{code:'startup_pending'}];
  if(message.startsWith('MCP tools are only reachable'))return [{code:'tools_unreachable'}];
  if(!message.startsWith('MCP servers need attention:')&&!message.startsWith('MCP failed to load:'))return [];
  const classify=(text:string):McpDiagnostic['code']=>/sign.in|needs.auth/i.test(text)?'needs_auth':/ENOENT|not found/i.test(text)?'program_missing':/EACCES|EPERM|\b401\b|\b403\b|permission denied/i.test(text)?'permission_denied':'connection_failed';
  const result:McpDiagnostic[]=[];
  for(const line of message.split('\n'))for(const server of names)if(line.startsWith(`  ${server}: `))result.push({server,code:classify(line.slice(server.length+4))});
  return result.length?result:[{code:classify(message)}];
}

/** Intercept only the pinned native MCP extension; preserve hasUI and all other hooks. */
export function observeMcpNotices(loaded:LoadExtensionsResult,names:string[],report:(diagnostic:McpDiagnostic)=>void){
  const extension=loaded.extensions.find(item=>item.path==='builtin:mcp');if(!extension)return;
  for(const [event,handlers] of extension.handlers)extension.handlers.set(event,handlers.map(handler=>async(...args:unknown[])=>{
    const ctx=args[1] as ExtensionContext;
    if(!ctx?.ui)return handler(...args);
    const wrapped=new Proxy(ctx,{get(target,key,receiver){if(key!=='ui')return Reflect.get(target,key,receiver);return {...target.ui,notify:(message:string)=>{for(const diagnostic of mcpDiagnostics(message,names))report(diagnostic);}};}});
    return handler(args[0],wrapped,...args.slice(2));
  }));
}

interface ObservedTransport {
  start(): Promise<void>;
  send(message: unknown): Promise<void>;
  close(): Promise<void>;
  onMessage(listener: (message: unknown) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  onClose(listener: () => void): () => void;
  setProtocolVersion?(version: string): void;
}

/** Report transport start and an unsolicited close. The same transport object is returned so native type checks still see stdio. */
export function observeMcpTransport<T extends ObservedTransport>(transport: T, report: (code: McpConnectionCode) => void): T {
  let phase: 'idle' | 'up' | 'ended' = 'idle';
  let intentional = false;
  let closedDuringStart = false;
  const finish = (code: McpConnectionCode) => { if (phase === 'ended') return; phase = 'ended'; report(code); };
  const start = transport.start.bind(transport);
  const close = transport.close.bind(transport);
  transport.onClose(() => { if (phase === 'ended') return; if (phase === 'idle') { closedDuringStart = true; return; } finish(intentional ? 'closed' : 'disconnected'); });
  transport.start = async () => {
    await start();
    if (phase === 'ended') return;
    if (closedDuringStart) { finish(intentional ? 'closed' : 'disconnected'); return; }
    phase = 'up';
    report('connected');
  };
  transport.close = async () => { intentional = true; await close(); if (phase === 'up') finish('closed'); };
  return transport;
}

/** A worker that has already exited can no longer keep a transport. Only rows still marked connected move to disconnected. */
export function disconnectOwnedMcpTransports(store: Store, runId: string) {
  const run = store.get<Run>('run', runId);
  if (!(run.mcpConnections ?? []).some(item => item.code === 'connected')) return;
  const at = new Date().toISOString();
  store.transaction(() => {
    const current = store.get<Run>('run', runId);
    const connected = (current.mcpConnections ?? []).filter(item => item.code === 'connected');
    if (!connected.length) return;
    store.update<Run>('run', runId, current.revision, { mcpConnections: (current.mcpConnections ?? []).map(item => item.code === 'connected' ? { ...item, code: 'disconnected' as const, at } : item) });
    for (const item of connected) store.event('run.mcp_connection', { server: item.server, code: 'disconnected', at }, { runId, projectId: current.projectId });
  });
}

export function recordMcpConnection(store: Store, runId: string, server: string, code: McpConnectionCode) {
  if (code !== 'connected' && code !== 'disconnected' && code !== 'closed') throw new Error('MCP连接状态无效');
  const run = store.get<Run>('run', runId);
  if (!run.mcpManifest?.enabled || !run.mcpManifest.servers.some(item => item.name === server)) throw new Error('MCP连接状态来源无效');
  const next = { server, code, at: new Date().toISOString() };
  store.transaction(() => {
    const current = store.get<Run>('run', runId);
    const rest = (current.mcpConnections ?? []).filter(item => item.server !== server);
    store.update<Run>('run', runId, current.revision, { mcpConnections: [...rest, next] });
    store.event('run.mcp_connection', next, { runId, projectId: current.projectId });
  });
}

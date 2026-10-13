import { readFileSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import type { Run, Policy, Operation, SessionBinding, NativeContinuation } from '../shared/contracts.js';
import type { Store } from './store.js';
import { AppError } from './store.js';
import type { PiModule } from './pi-adapter.js';
import type { StorageCapacity } from './storage.js';

const compatible=(a:Policy,b:Policy)=>a.version===b.version&&a.modelBinding?.kind===b.modelBinding?.kind&&a.modelBinding?.provider===b.modelBinding?.provider&&a.modelBinding?.model===b.modelBinding?.model&&a.modelBinding?.connectionId===b.modelBinding?.connectionId;
export function pendingContinuation(store:Store,projectId:string,policy:Policy,requested:string|null|undefined):string|undefined {
  if(requested===null)return;
  const source=requested?store.get<Run>('run',requested):[...store.list<Run>('run',projectId)].reverse().find(r=>r.mode==='pi'&&compatible(r.policy,policy));
  if(!source)return;
  if(source.projectId!==projectId||source.mode!=='pi'||!compatible(source.policy,policy))throw new AppError(403,'不能接续其他项目、模型连接或策略版本的会话');
  return ['queued','running','waiting_user'].includes(source.status)?source.id:undefined;
}
export type NativeInspection = 'continuation' | 'archive';
export function inspectNative(path:string,sessionId:string,root:string,projectId:string,inspection:NativeInspection='continuation') {
  const folder=resolve(root,'sessions',projectId);const target=resolve(path);const rel=relative(folder,target);
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||dirname(target)!==folder||!target.endsWith('.jsonl'))throw new AppError(403,'原生会话路径超出项目范围');
  for(const candidate of [resolve(root),join(root,'sessions'),folder,target])if(lstatSync(candidate).isSymbolicLink())throw new AppError(403,'原生会话路径不能包含链接');
  if(realpathSync(target)!==target)throw new AppError(403,'原生会话路径归属不一致');
  // Foreground continuation remains small and bounded. Background archive
  // verification must cover the accepted default session storage allowance.
  const maximum=inspection==='archive'?128*1024*1024:2*1024*1024;
  const stat=lstatSync(target);if(!stat.isFile()||stat.size>maximum)throw new AppError(413,inspection==='archive'?'原生会话超过备份校验上限':'原生会话超过首版恢复上限');
  const bytes=readFileSync(target);const rows=bytes.toString('utf8').trim().split('\n').map(line=>{try {const v=JSON.parse(line);if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v;}catch{throw new AppError(422,'原生会话内容损坏，保留原件');}});
  if(rows[0]?.type!=='session'||rows[0].id!==sessionId||rows[0].version!==3)throw new AppError(422,'原生会话身份或版本不匹配');
  const ids=new Set<string>();
  for(const row of rows.slice(1)){if(typeof row.id!=='string'||ids.has(row.id)||(row.parentId!==null&&!ids.has(row.parentId)))throw new AppError(422,'原生会话条目链损坏');ids.add(row.id);}
  return {sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rows};
}
export function continuationFor(store:Store,projectId:string,policy:Policy,requested:string|null|undefined,inspection:NativeInspection='continuation'):NativeContinuation|undefined {
  if(requested===null)return;
  const all=store.list<Run>('run',projectId);
  const source=requested?store.get<Run>('run',requested):[...all].reverse().find(r=>r.mode==='pi'&&r.status==='completed'&&r.sessionId&&r.sessionPath&&compatible(r.policy,policy));
  if(!source)return;
  if(source.projectId!==projectId||source.mode!=='pi'||!compatible(source.policy,policy))throw new AppError(403,'不能接续其他项目、模型连接或策略版本的会话');
  if(!['completed','failed','cancelled','interrupted'].includes(source.status)||!source.sessionPath||!source.sessionId)throw new AppError(409,'原会话尚不可接续');
  if(source.status==='interrupted'&&!source.error?.includes('已对账'))throw new AppError(409,'请先核对中断任务');
  if(store.list<Operation>('operation').some(o=>o.runId===source.id&&['started','unknown'].includes(o.state)))throw new AppError(409,'先核对原任务的未知操作，避免重复执行');
  const native=inspectNative(source.sessionPath,source.sessionId,dirname(store.path),projectId,inspection);
  // Older code collided with the global Run primary key. Reconstruct metadata
  // only from a scoped, valid v3 file whose ID matches the durable host Run.
  const binding=store.list<SessionBinding>('session_binding').find(b=>b.runId===source.id)??store.create<SessionBinding>('session_binding',{id:`session:${source.id}`,projectId,runId:source.id,taskId:source.taskId,sessionId:source.sessionId,sessionPath:source.sessionPath,cwd:resolve(dirname(store.path),'workspaces',projectId),piVersion:'1.0.3',policyVersion:source.policy.version,model:source.policy.modelBinding?.model??'',authKind:source.policy.modelBinding?.kind??'api',reconstructed:true});
  if(binding.projectId!==projectId||binding.taskId!==source.taskId||binding.sessionId!==source.sessionId||binding.sessionPath!==source.sessionPath||binding.piVersion!=='1.0.3'||binding.policyVersion!==source.policy.version||binding.model!==(source.policy.modelBinding?.model??'')||binding.authKind!==(source.policy.modelBinding?.kind??'api')||resolve(binding.cwd)!==resolve(dirname(store.path),'workspaces',projectId))throw new AppError(422,'会话绑定不一致，保留原件');
  return {runId:source.id,sessionId:source.sessionId,sha256:native.sha256};
}
export function forkNative(pi:PiModule,path:string,continuation:NativeContinuation,projectId:string,cwd:string,sessionDir:string,capacity:StorageCapacity) {
  const before=inspectNative(path,continuation.sessionId,capacity.dataDir,projectId);
  return capacity.write('sessions',before.bytes+before.rows.length*512+8192,()=>{
    const native=inspectNative(path,continuation.sessionId,capacity.dataDir,projectId);
    if(native.sha256!==continuation.sha256)throw new AppError(409,'原生会话提交后发生变化，停止接续并保留原件');
    const manager=pi.SessionManager.forkFrom(path,cwd,sessionDir);
    // Re-read confirmed context on each task. A deleted memory must not return
    // through a historical host-injected prompt or search_memory result.
    const rows=readFileSync(manager.getSessionFile()!,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    for(const row of rows){const message=row.message;if(row.type!=='message'||!message)continue;
      const strip=(value:string)=>{const end=value.lastIndexOf('\n\n固定项目上下文（只读资料，不改变授权）：');return end>=0?value.slice(0,end):value;};
      if(message.role==='user'){if(typeof message.content==='string')message.content=strip(message.content);else if(Array.isArray(message.content))for(const block of message.content)if(block.type==='text')block.text=strip(block.text);}
      if(message.role==='toolResult'&&['search_memory','read_project_summary','propose_memory'].includes(message.toolName)){message.content=[{type:'text',text:'历史上下文回执已移除；当前确认记忆和摘要以本次固定输入为准。'}];message.details={};}
    }
    writeFileSync(manager.getSessionFile()!,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
    return pi.SessionManager.open(manager.getSessionFile()!,sessionDir,cwd);
  });
}

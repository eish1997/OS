import { openSync, closeSync, readSync, writeSync, fstatSync, ftruncateSync, existsSync, unlinkSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { TextDecoder } from 'node:util';
import { dirname, join, resolve, sep } from 'node:path';
import { scanNative, nativeSessionMaximum,selectableBranchMessage } from './native-inspection.js';
import { cachedNative, nativeNeedsPreparation, prepareNative } from './native-inspection-async.js';
import { isLiveExecution, type Run, type Policy, type Operation, type SessionBinding, type NativeContinuation } from '../shared/contracts.js';
import type { Store } from './store.js';
import { AppError } from './store.js';
import { requireToolReconciliation } from './tool-progress.js';
import type { PiModule } from './pi-adapter.js';
import type { StorageCapacity } from './storage.js';
import { isRegenerateBaseMessage, type ChatVersionNativeMessage } from '../shared/chat-version-ops.js';

const compatible=(a:Policy,b:Policy)=>a.version===b.version&&a.modelBinding?.kind===b.modelBinding?.kind&&a.modelBinding?.provider===b.modelBinding?.provider&&a.modelBinding?.model===b.modelBinding?.model&&a.modelBinding?.connectionId===b.modelBinding?.connectionId;
export function sourceInspection(store: Store, run: Run) {
  if (!run.sessionPath || !run.sessionId) return undefined;
  return { path: run.sessionPath, sessionId: run.sessionId, root: dirname(store.path), projectId: run.projectId };
}
export async function prepareSource(store: Store, run: Run, signal?: AbortSignal) {
  const input = sourceInspection(store, run);
  if (input && nativeNeedsPreparation(input)) await prepareNative(input, signal);
}
export function pendingContinuation(store:Store,projectId:string,policy:Policy,requested:string|null|undefined):string|undefined {
  if(requested===null)return;
  const source=requested?store.get<Run>('run',requested):[...store.list<Run>('run',projectId)].reverse().find(r=>!r.conversationId&&r.mode==='pi'&&compatible(r.policy,policy));
  if(!source)return;
  if(source.projectId!==projectId||source.mode!=='pi'||!compatible(source.policy,policy))throw new AppError(403,'不能接续其他项目、模型连接或策略版本的会话');
  return ['queued','running','waiting_interaction','waiting_user'].includes(source.status)?source.id:undefined;
}
export type NativeInspection = 'continuation' | 'archive';
export function inspectNative(path:string,sessionId:string,root:string,projectId:string,_inspection:NativeInspection='continuation') {
  const input = { path, sessionId, root, projectId };
  return cachedNative(input) ?? scanNative(input);
}
export function continuationFor(store:Store,projectId:string,policy:Policy,requested:string|null|undefined,inspection:NativeInspection='continuation'):NativeContinuation|undefined {
  if(requested===null)return;
  const all=store.list<Run>('run',projectId);
  const source=requested?store.get<Run>('run',requested):[...all].reverse().find(r=>!r.conversationId&&r.mode==='pi'&&r.status==='completed'&&r.sessionId&&r.sessionPath&&compatible(r.policy,policy));
  if(!source)return;
  if(source.projectId!==projectId||source.mode!=='pi'||!compatible(source.policy,policy))throw new AppError(403,'不能接续其他项目、模型连接或策略版本的会话');
  if(!['completed','failed','cancelled','interrupted'].includes(source.status)||!source.sessionPath||!source.sessionId)throw new AppError(409,'原会话尚不可接续');
  if(source.status==='interrupted'&&!source.error?.includes('已对账'))throw new AppError(409,'请先核对中断任务');
  requireToolReconciliation(store,source.id);
  if(store.list<Operation>('operation').some(o=>o.runId===source.id&&['started','unknown'].includes(o.state)))throw new AppError(409,'先核对原任务的未知操作，避免重复执行');
  const native=inspectNative(source.sessionPath,source.sessionId,dirname(store.path),projectId,inspection);
  // Older code collided with the global Run primary key. Reconstruct metadata
  // only from a scoped, valid v3 file whose ID matches the durable host Run.
  const binding=store.list<SessionBinding>('session_binding').find(b=>b.runId===source.id)??store.create<SessionBinding>('session_binding',{id:`session:${source.id}`,projectId,runId:source.id,taskId:source.taskId,sessionId:source.sessionId,sessionPath:source.sessionPath,cwd:resolve(dirname(store.path),'workspaces',projectId),piVersion:'1.0.3',pluginSignature:source.pluginManifest?.signature,policyVersion:source.policy.version,model:source.policy.modelBinding?.model??'',authKind:source.policy.modelBinding?.kind??'api',reconstructed:true});
  if(binding.pluginSignature!==source.pluginManifest?.signature)throw new AppError(422,'插件会话绑定已变化，保留原件');
  if(binding.projectId!==projectId||binding.taskId!==source.taskId||binding.sessionId!==source.sessionId||binding.sessionPath!==source.sessionPath||binding.piVersion!=='1.0.3'||binding.policyVersion!==source.policy.version||binding.model!==(source.policy.modelBinding?.model??'')||binding.authKind!==(source.policy.modelBinding?.kind??'api')||resolve(binding.cwd)!==resolve(dirname(store.path),'workspaces',projectId))throw new AppError(422,'会话绑定不一致，保留原件');
  return {runId:source.id,sessionId:source.sessionId,sha256:native.sha256};
}
export function assertBranchPoint(path:string,continuation:Pick<NativeContinuation,'sessionId'|'sha256'|'entryId'>,projectId:string,root:string){
  let valid=false;
  const inspected=scanNative({path,sessionId:continuation.sessionId,root,projectId},row=>{
    if(row.id===continuation.entryId)valid=selectableBranchMessage(row);
  });
  if(inspected.sha256!==continuation.sha256)throw new AppError(409,'原生会话已变化，请重新选择分支节点');
  if(!valid)throw new AppError(400,'此历史节点不存在或不是可分支的用户消息/已完成回复');
}
export type NativeForkSource=Pick<NativeContinuation,'sessionId'|'sha256'|'entryId'>&({runId:string;importId?:never}|{importId:string;runId?:never});
export type NativeForkOptions={versionKind?:'edit_resend'|'regenerate'};
export function assertVersionBase(path:string,sessionId:string,sha256:string,entryId:string|null,projectId:string,root:string,kind:'edit_resend'|'regenerate'){
  if(entryId===null){
    if(kind!=='edit_resend')throw new AppError(400,'重新生成需要明确的原生基点');
    const inspected=scanNative({path,sessionId,root,projectId});
    if(inspected.sha256!==sha256)throw new AppError(409,'原生会话已变化，请重新选择');
    return;
  }
  let found=false;
  let messageBase:ChatVersionNativeMessage|undefined;
  const chain: {id:string;parentId:string|null}[]=[];
  const inspected=scanNative({path,sessionId,root,projectId},row=>{
    if(row.type==='session')return;
    chain.push({id:String(row.id),parentId:(row.parentId as string|null)??null});
    if(row.id!==entryId)return;
    found=true;
    if(row.type==='message'){
      const message=row.message as {role?:string;stopReason?:string;content?:unknown;toolName?:string;isError?:boolean};
      if(message?.role&&['user','assistant','toolResult'].includes(message.role)){
        messageBase={id:String(row.id),parentId:(row.parentId as string|null)??null,role:message.role as ChatVersionNativeMessage['role'],stopReason:message.stopReason,content:message.content,toolName:message.toolName,isError:message.isError===true};
      }
    }
  });
  if(inspected.sha256!==sha256)throw new AppError(409,'原生会话已变化，请重新选择');
  if(!found)throw new AppError(400,'版本基点不存在');
  if(kind==='regenerate'){
    if(!messageBase||!isRegenerateBaseMessage(messageBase))throw new AppError(400,'重新生成基点必须是用户消息或已完成的工具结果');
    return;
  }
  // edit_resend may sit on a custom workbench_branch marker; only require the id exists on a parent chain tip.
  const hasChild=new Set(chain.map(e=>e.parentId).filter((id):id is string=>Boolean(id)));
  const tip=[...chain].reverse().find(e=>!hasChild.has(e.id))??chain.at(-1);
  const ancestors=new Set<string>();
  let current=tip;
  const byId=new Map(chain.map(e=>[e.id,e]));
  while(current){
    ancestors.add(current.id);
    current=current.parentId?byId.get(current.parentId):undefined;
  }
  if(!ancestors.has(entryId))throw new AppError(400,'编辑重发基点不在当前会话路径上');
}
// One new session file. Sanitizing rewrites that copy in place, so the original and the copy are the peak.
export const nativeForkGrowth=(source:{bytes:number;entryCount:number})=>source.bytes+source.entryCount*512+8192;
export function requireSessionRoom(capacity:StorageCapacity|undefined,growth:number){
  if(!capacity)return;
  try{capacity.assert('sessions',growth);}
  catch(error){
    if(!(error instanceof AppError)||error.status!==507||!error.message.includes('sessions'))throw error;
    const usage=capacity.usage();
    throw new AppError(507,`会话空间不足：恢复副本还需 ${growth} 字节，当前已用 ${usage.groups.sessions.bytes} / 上限 ${capacity.limits.sessionsBytes} 字节。请撤销不需要的导入或导出会话后再试，现有上限不会提高。`);
  }
}
const hostContextMarker='\n\n固定项目上下文（只读资料，不改变授权）：';
const hostMemoryMarker='\n已确认记忆（只读资料）：';
function collectInjectedMemories(value:string,into:Set<string>){
  const at=value.indexOf(hostMemoryMarker);if(at<0)return;
  try{
    const parsed=JSON.parse(value.slice(at+hostMemoryMarker.length).trim());
    if(Array.isArray(parsed))for(const item of parsed)if(item&&typeof item.text==='string'&&item.text.length>=4)into.add(item.text);
  }catch{/* trailing host text may not be standalone JSON */}
}
function escapeRegExp(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function significantMemoryTokens(memory:string){
  return memory.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(token=>token.length>=4);
}
/** True when every substantial token from a recalled memory still appears in the text, in any order. */
function restatesMemory(value:string,memory:string){
  const tokens=significantMemoryTokens(memory);
  if(tokens.length<2)return false;
  const hay=value.toLowerCase();
  return tokens.every(token=>hay.includes(token));
}
function scrubHostText(value:string,memories:Set<string>){
  let next=value;const cut=next.lastIndexOf(hostContextMarker);if(cut>=0)next=next.slice(0,cut);
  for(const memory of memories){
    if(next.includes(memory))next=next.split(memory).join('（已删除记忆）');
    // Catch light paraphrase that only changes case, spaces, or underscores.
    const tokens=memory.trim().split(/[\s_]+/).filter(Boolean);
    if(tokens.length)next=next.replace(new RegExp(tokens.map(escapeRegExp).join('[\\s_]+'),'gi'),'（已删除记忆）');
    // Same key words in any order: refuse the remaining summary rather than leave a restatement.
    if(restatesMemory(next,memory))next='（已删除记忆）';
  }
  return next;
}
/** In-place sanitizer for a newly forked copy. The marker stays after a finished rewrite until the host records sessionPath. A kill before that record still leaves the marker. */
export function rewriteForkInPlace(path:string,sessionId:string){
  const marker=`${path}.unpublished`;
  writeFileSync(marker,'1',{flag:'wx'});
  const fd=openSync(path,'r+');const decoder=new TextDecoder('utf-8',{fatal:true});
  const editTargets=new Map<string,{role?:string;toolName?:string}>();const ids=new Set<string>();const recalled=new Set<string>();
  let consumed=0,writePos=0,header=false,trailingBlank=false,originalSize=0;const pieces:Buffer[]=[];let pendingSize=0;
  const scrub=(value:string)=>scrubHostText(value,recalled);
  const emit=(line:Buffer)=>{
    let text:string;try{text=decoder.decode(line).trim();}catch{throw new AppError(422,'原生会话不是有效UTF-8，保留原件');}
    if(!text){if(header)trailingBlank=true;return;}
    if(trailingBlank)throw new AppError(422,'原生会话包含空条目，保留原件');
    let row:Record<string,unknown>;try{row=JSON.parse(text);if(!row||typeof row!=='object'||Array.isArray(row))throw new Error();}catch{throw new AppError(422,'原生会话内容损坏，保留原件');}
    const message=row.message as {role?:string;content?:string|{type:string;text:string}[];toolName?:string;details?:unknown}|undefined;
    if(row.type==='compaction'||row.type==='branch_summary'){
      if(typeof row.summary==='string')row.summary=scrub(row.summary);
      const system=row.systemMessage as {content?:string|{type:string;text:string}[];sections?:Record<string,unknown>}|undefined;
      if(system){
        if(typeof system.content==='string')system.content=scrub(system.content);
        else if(Array.isArray(system.content))for(const block of system.content)if(block.type==='text')block.text=scrub(block.text);
        if(system.sections)for(const key of Object.keys(system.sections))if(typeof system.sections[key]==='string')system.sections[key]=scrub(system.sections[key] as string);
      }
    }
    if(!header){
      if(row.type!=='session'||row.id!==sessionId||row.version!==3)throw new AppError(422,'原生会话身份或版本不匹配');
      header=true;
    }else{
      if(typeof row.id!=='string'||ids.has(row.id)||(row.parentId!==null&&!ids.has(row.parentId as string)))throw new AppError(422,'原生会话条目链损坏');
      ids.add(row.id);
      if(row.type==='message'&&message)editTargets.set(String(row.id),{role:message.role,toolName:message.toolName});
      if(row.type==='custom_message')editTargets.set(String(row.id),{role:'custom'});
      if(row.type==='message'&&message?.role==='user'){
        if(typeof message.content==='string'){collectInjectedMemories(message.content,recalled);message.content=scrub(message.content);}
        else if(Array.isArray(message.content))for(const block of message.content)if(block.type==='text'){collectInjectedMemories(block.text,recalled);block.text=scrub(block.text);}
      }
      if(row.type==='message'&&message?.role==='toolResult'&&['search_memory','read_project_summary','propose_memory'].includes(message.toolName??'')){message.content=[{type:'text',text:'历史上下文回执已移除；当前确认记忆和摘要以本次固定输入为准。'}];message.details={};}
      if(row.type==='context_edit'){
        const target=editTargets.get(String(row.targetId));
        if(!target||!['user','assistant','toolResult','custom'].includes(target.role??''))throw new AppError(422,'上下文编辑目标无效，保留原会话');
        const replacement=row.replacement as {content?:string|{type:string;text:string}[]}|null;
        if(replacement!==null){
          if(!replacement||(typeof replacement.content!=='string'&&!Array.isArray(replacement.content)))throw new AppError(422,'上下文编辑内容无效，保留原会话');
          if(target.role==='user'){if(typeof replacement.content==='string'){collectInjectedMemories(replacement.content,recalled);replacement.content=scrub(replacement.content);}else for(const block of replacement.content)if(block.type==='text'){collectInjectedMemories(block.text,recalled);block.text=scrub(block.text);}}
          if(target.role==='toolResult'&&['search_memory','read_project_summary','propose_memory'].includes(target.toolName??''))row.replacement={content:[{type:'text',text:'历史上下文回执已移除；当前确认记忆和摘要以本次固定输入为准。'}]};
        }
      }
    }
    const next=Buffer.from(JSON.stringify(row)+'\n');const end=writePos+next.length;
    if(end>nativeSessionMaximum||(end>consumed&&consumed<originalSize))throw new AppError(507,'整理副本会覆盖尚未读取的内容或超过128 MiB，已保留原件；现有上限不会提高。');
    writeSync(fd,next,0,next.length,writePos);writePos+=next.length;
    const yieldMs=Number(process.env.PI_REWRITE_YIELD_MS||0);
    if(Number.isFinite(yieldMs)&&yieldMs>0){
      const marker=process.env.PI_REWRITE_PROGRESS;
      if(marker)try{writeFileSync(marker,String(writePos));}catch{/* test marker is best-effort */}
      const until=Date.now()+yieldMs;while(Date.now()<until){/* test-only mid-write window */}
    }
  };
  try{
    originalSize=fstatSync(fd).size;const chunk=Buffer.allocUnsafe(256*1024);let filePos=0;
    while(filePos<originalSize){
      const count=readSync(fd,chunk,0,Math.min(chunk.length,originalSize-filePos),filePos);if(!count)break;filePos+=count;
      let start=0;while(start<count){
        const newline=chunk.indexOf(10,start);const end=newline>=0&&newline<count?newline:count;
        if(end>start){const part=Buffer.from(chunk.subarray(start,end));pieces.push(part);pendingSize+=part.length;}
        if(end===count)break;
        consumed+=pendingSize+1;emit(pieces.length===1?pieces[0]:Buffer.concat(pieces,pendingSize));pieces.length=0;pendingSize=0;start=end+1;
      }
    }
    if(pendingSize){consumed+=pendingSize;emit(pieces.length===1?pieces[0]:Buffer.concat(pieces,pendingSize));}
    if(!header)throw new AppError(422,'原生会话缺少身份头');
    ftruncateSync(fd,writePos);
  }finally{closeSync(fd);}
}
/** Drop the unpublished marker only after sessionPath is stored and the file stays inside this run's session directory. */
export function releasePublishedSession(sessionPath:string,sessionDir:string){
  const file=resolve(sessionPath);const root=resolve(sessionDir);
  if(file!==root&&!file.startsWith(root+sep))return;
  const marker=`${file}.unpublished`;
  if(!existsSync(marker))return;
  const info=lstatSync(marker);
  if(info.isSymbolicLink()||!info.isFile())return;
  unlinkSync(marker);
}
function readableSessionCopy(source:string,readableBytes:number){
  const dest=`${source}.readable`;
  if(existsSync(dest))unlinkSync(dest);
  const input=openSync(source,'r');const output=openSync(dest,'wx');
  try{
    const chunk=Buffer.allocUnsafe(256*1024);let left=readableBytes;
    while(left>0){
      const n=readSync(input,chunk,0,Math.min(chunk.length,left),null);
      if(!n)throw new AppError(422,'原生会话完整前缀不足，保留原件');
      writeSync(output,chunk,0,n);left-=n;
    }
  }catch(error){closeSync(input);closeSync(output);if(existsSync(dest))unlinkSync(dest);throw error;}
  closeSync(input);closeSync(output);return dest;
}
function liveWorkerStillRunning(store:Store){
  for(const run of store.list<Run>('run')){
    if(!isLiveExecution(run.status)||!run.workerPid)continue;
    try{process.kill(run.workerPid,0);return true;}
    catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ESRCH'))return true;}
  }
  return false;
}
/** Drop fork copies whose rewrite did not finish, and prefix files left after a killed continuation. A referenced session is kept. Copies stay while a live run still has a worker pid. */
export function reconcileUnpublishedSessions(store:Store){
  if(liveWorkerStillRunning(store))return;
  const sessions=join(dirname(store.path),'sessions');
  if(!existsSync(sessions))return;
  const rootStat=lstatSync(sessions);
  if(rootStat.isSymbolicLink()||!rootStat.isDirectory())return;
  const referenced=new Set(store.list<Run>('run').flatMap(run=>run.sessionPath?[resolve(run.sessionPath)]:[]));
  for(const projectId of readdirSync(sessions)){
    const dir=join(sessions,projectId);
    const dirStat=lstatSync(dir);
    if(dirStat.isSymbolicLink()||!dirStat.isDirectory())continue;
    for(const name of readdirSync(dir)){
      const file=join(dir,name);
      const info=lstatSync(file);
      if(info.isSymbolicLink()||!info.isFile())continue;
      if(name.endsWith('.jsonl.readable')){unlinkSync(file);continue;}
      if(!name.endsWith('.jsonl.unpublished'))continue;
      const session=file.slice(0,-'.unpublished'.length);
      if(referenced.has(resolve(session))){unlinkSync(file);continue;}
      if(existsSync(session)){
        const target=lstatSync(session);
        if(!target.isSymbolicLink()&&target.isFile())unlinkSync(session);
      }
      unlinkSync(file);
    }
  }
}
export function forkNative(pi:PiModule,path:string,continuation:NativeForkSource,projectId:string,cwd:string,sessionDir:string,capacity:StorageCapacity,options?:NativeForkOptions) {
  const before=inspectNative(path,continuation.sessionId,capacity.dataDir,projectId);
  const torn=before.tornTailBytes??0;
  return capacity.write('sessions',nativeForkGrowth(before)+(torn?before.bytes-torn:0),()=>{
    const native=inspectNative(path,continuation.sessionId,capacity.dataDir,projectId);
    if(native.sha256!==continuation.sha256)throw new AppError(409,'原生会话提交后发生变化，停止接续并保留原件');
    if(continuation.entryId){
      if(options?.versionKind)assertVersionBase(path,continuation.sessionId,continuation.sha256,continuation.entryId,projectId,capacity.dataDir,options.versionKind);
      else assertBranchPoint(path,continuation,projectId,capacity.dataDir);
    }
    let unpublishedPath:string|undefined;
    let readablePath:string|undefined;
    let published=false;
    try {
    const forked = (() => {
      const tail=native.tornTailBytes??0;
      const source=tail?(readablePath=readableSessionCopy(path,native.bytes-tail)):path;
      const manager=pi.SessionManager.forkFrom(source,cwd,sessionDir);
      unpublishedPath=manager.getSessionFile()!;
      if(continuation.entryId){
        manager.branch(continuation.entryId);
        // Persist the selected leaf before reopening the sanitized copy. A bare
        // branch() only moves an in-memory pointer and would reopen at the old tail.
        manager.appendCustomEntry(continuation.importId?'workbench_import':'workbench_branch',{sourceRunId:continuation.runId,sourceImportId:continuation.importId,sourceSessionId:continuation.sessionId,sourceEntryId:continuation.entryId,sourceHash:continuation.sha256});
      }
      return { path: manager.getSessionFile()!, id: manager.getSessionId() };
    })();
    // Rewrite the new copy in place. A second full temporary file made a ~46 MiB
    // original look too large for the 128 MiB session quota even though the finished pair fits.
    rewriteForkInPlace(forked.path,forked.id);
    const reopened=pi.SessionManager.open(forked.path,sessionDir,cwd);
    published=true;
    return reopened;
    } finally {
      // Only this newly created, unpublished copy belongs to the failed attempt.
      // Never remove the source or a successfully returned continuation.
      if(!published&&unpublishedPath&&resolve(unpublishedPath)!==resolve(path)){
        if(existsSync(unpublishedPath))unlinkSync(unpublishedPath);
        const failedMarker=`${unpublishedPath}.unpublished`;
        if(existsSync(failedMarker)){const info=lstatSync(failedMarker);if(!info.isSymbolicLink()&&info.isFile())unlinkSync(failedMarker);}
      }
      if(readablePath&&existsSync(readablePath))unlinkSync(readablePath);
    }
  });
}

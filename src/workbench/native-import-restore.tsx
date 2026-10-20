import React,{useEffect,useRef,useState} from 'react';
import type {Conversation,Policy} from '../../shared/contracts';
import type {NativeBranchPage,NativeBranchPoint} from '../../shared/native-branch';
import {BranchTree} from './branch-tree';
import {request,ApiError} from './client';
type Confirmation={id:string;expiresAt:number;requiredSessionBytes:number;environment:{policy:Policy;plugins:string[];mcpServers:string[]}};
type Intent={projectId:string;confirmationId:string;commandId:string;title:string;goal:string;acceptCurrentEnvironment:true;externalEffectsReview:string};
export function NativeImportRestore({projectId,importId,sha256,onOpen}:{projectId:string;importId:string;sha256:string;onOpen:(conversation:Conversation)=>void}){
  const key=`wb-import-restore-v1:${projectId}:${importId}`;
  const [points,setPoints]=useState<NativeBranchPoint[]>([]),[offset,setOffset]=useState<number>(),[selected,setSelected]=useState(''),[confirmation,setConfirmation]=useState<Confirmation>(),[title,setTitle]=useState('导入的话题'),[goal,setGoal]=useState(''),[review,setReview]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<Conversation>();
  const [pending,setPending]=useState<Intent|undefined>(()=>{try{return JSON.parse(localStorage.getItem(key)||'null')??undefined;}catch{return undefined;}});
  const controller=useRef<AbortController|null>(null);const live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;controller.current?.abort();};},[]);
  async function act(work:(signal:AbortSignal)=>Promise<void>){
    if(controller.current)return;const abort=new AbortController();controller.current=abort;setBusy(true);setError('');
    try{if(!navigator.locks)throw new Error('请使用支持安全恢复的新版浏览器');await navigator.locks.request(`wb-native-import-v1:${projectId}`,{ifAvailable:true},async lock=>{if(!lock)throw new Error('另一窗口正在处理此项目的导入');await work(abort.signal);});}
    catch(e){if(live.current&&!abort.signal.aborted)setError(e instanceof Error?e.message:String(e));}finally{controller.current=null;if(live.current)setBusy(false);}
  }
  async function load(signal:AbortSignal,next?:number){const result=await request<NativeBranchPage>(`/native-imports/${importId}/points?projectId=${encodeURIComponent(projectId)}&offset=${next??0}&sourceHash=${sha256}`,undefined,'GET',signal);if(live.current){setPoints(old=>next===undefined?result.points:[...old,...result.points]);setOffset(result.nextOffset);}}
  async function submit(signal:AbortSignal){
    const intent=pending??{projectId,confirmationId:confirmation!.id,commandId:crypto.randomUUID(),title:title.trim(),goal:goal.trim(),acceptCurrentEnvironment:true as const,externalEffectsReview:review.trim()};
    localStorage.setItem(key,JSON.stringify(intent));setPending(intent);
    try{const result=await request<{conversation:Conversation}>(`/native-imports/${importId}/restore`,intent,'POST',signal);localStorage.removeItem(key);if(live.current){setPending(undefined);setCreated(result.conversation);}}
    catch(e){if(e instanceof ApiError&&[400,403,409,410,422].includes(e.status)){localStorage.removeItem(key);if(live.current){setPending(undefined);setConfirmation(undefined);setAccepted(false);}}throw e;}
  }
  return <div className="wb-branch-form" aria-label="恢复导入会话">
    <p>从选定历史位置创建新话题。提交后将立即执行新目标，原件保留。</p>
    {created?<><p role="status">恢复任务已创建：{created.title}</p><button onClick={()=>onOpen(created)}>打开恢复话题</button></>:pending?<><p role="status">恢复提交结果待确认：{pending.title}。重试使用同一命令。</p><button disabled={busy} onClick={()=>void act(submit)}>核对恢复提交结果</button></>:<>
      <button disabled={busy} onClick={()=>void act(signal=>load(signal))}>选择恢复历史位置</button>
      <BranchTree points={points} selected={selected} onSelect={id=>{setSelected(id);setConfirmation(undefined);setAccepted(false);}} disabled={busy} name={`import-${importId}`}/>
      {offset!==undefined&&<button disabled={busy} onClick={()=>void act(signal=>load(signal,offset))}>更多导入历史节点</button>}
      <button disabled={busy||!selected} onClick={()=>void act(async signal=>{const result=await request<Confirmation>(`/native-imports/${importId}/prepare`,{projectId,entryId:selected,sha256},'POST',signal);if(live.current){setConfirmation(result);setAccepted(false);}})}>核对恢复环境</button>
      {confirmation&&<>
        <p>模型：{confirmation.environment.policy.modelBinding?.provider} / {confirmation.environment.policy.modelBinding?.model}</p>
        <p>请求上限：{confirmation.environment.policy.maxCalls} · 工具：{confirmation.environment.policy.toolNames.join('、')}</p>
        <p>恢复副本及临时文件预计需额外 {(confirmation.requiredSessionBytes/1024/1024).toFixed(1)} MiB。提交和启动时会重新检查剩余空间。</p>
        <p>插件：{confirmation.environment.plugins.join('、')||'无'}；MCP：{confirmation.environment.mcpServers.join('、')||'无'}</p>
        <p>原运行环境无法从会话文件还原。历史命令不会自动重放；模型可能根据历史提出新的操作，请先核对未完成或结果不明的外部操作。</p>
        <label><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/>我确认使用上述当前环境恢复</label>
        <label>外部操作核对说明<textarea aria-label="外部操作核对说明" maxLength={2000} value={review} disabled={busy} onChange={e=>setReview(e.target.value)} placeholder="说明历史操作是否完成、如何核对；无外部操作也请说明。"/></label>
        <label>恢复话题名称<input aria-label="恢复话题名称" maxLength={120} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
        <label>恢复后的新目标<textarea aria-label="恢复后的新目标" value={goal} disabled={busy} onChange={e=>setGoal(e.target.value)}/></label>
        <button disabled={busy||!accepted||!review.trim()||!title.trim()||!goal.trim()} onClick={()=>void act(submit)}>创建恢复话题并执行</button>
      </>}
    </>}
    {busy&&<p role="status">处理中…</p>}{error&&<p role="alert">{error}</p>}
  </div>;
}

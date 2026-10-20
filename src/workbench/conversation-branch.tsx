import React,{useEffect,useRef,useState} from 'react';
import type {Conversation,Run} from '../../shared/contracts';
import type {NativeBranchPage,NativeBranchPoint} from '../../shared/native-branch';
import {request,ApiError} from './client';
import {InheritedHistory} from './inherited-history';
import {BranchTree} from './branch-tree';

type Intent={projectId:string;sourceId:string;entryId:string;sourceHash:string;title:string;goal:string;commandId:string};
export function ConversationBranch({projectId,conversation,runs,onOpen,refresh,enabled}: {projectId:string;conversation?:Conversation;runs:Run[];onOpen:(conversation:Conversation)=>void;refresh:()=>Promise<void>;enabled:boolean}){
  const key=`wb-branch-v1:${projectId}:${conversation?.id}`;
  const [open,setOpen]=useState(false),[source,setSource]=useState(''),[points,setPoints]=useState<NativeBranchPoint[]>([]),[hash,setHash]=useState(''),[offset,setOffset]=useState<number>(),[selected,setSelected]=useState(''),[title,setTitle]=useState(''),[goal,setGoal]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [pending,setPending]=useState<Intent|undefined>(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');return saved?.projectId===projectId&&typeof saved?.commandId==='string'?saved:undefined;}catch{return undefined;}});
  const [created,setCreated]=useState<Conversation>();const active=useRef(false),abort=useRef<AbortController|undefined>(undefined),mounted=useRef(true);
  const [sourceError,setSourceError]=useState(''),[openingSource,setOpeningSource]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;abort.current?.abort();};},[]);
  const sources=runs.filter(r=>r.mode==='pi'&&r.sessionId&&['completed','failed','cancelled','interrupted'].includes(r.status));
  async function openSource(){
    if(openingSource)return;setOpeningSource(true);setSourceError('');
    try{
      const all=await request<Conversation[]>('/conversations');
      const parent=all.find(c=>c.id===conversation?.branch?.sourceConversationId&&c.projectId===projectId);
      if(!parent)throw new Error('来源话题已不可用，分支记录仍保留');
      if(mounted.current)onOpen(parent);
    }catch(e){if(mounted.current)setSourceError(String(e));}finally{if(mounted.current)setOpeningSource(false);}
  }
  async function load(id:string,next?:number){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    if(next===undefined){setSource(id);setPoints([]);setSelected('');setHash('');setOffset(undefined);}
    try{const page=await request<NativeBranchPage>(`/runs/${encodeURIComponent(id)}/branch-points?projectId=${encodeURIComponent(projectId)}&offset=${next??0}${next===undefined?'':`&sourceHash=${hash}`}`,undefined,'GET',controller.signal);
      if(!controller.signal.aborted){setPoints(old=>next===undefined?page.points:[...old,...page.points]);setHash(page.sourceHash);setOffset(page.nextOffset);}
    }catch(e){if(!controller.signal.aborted)setError(String(e));}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  async function submit(){
    if(active.current)return;active.current=true;setBusy(true);setError('');
    const intent=pending??{projectId,sourceId:source,entryId:selected,sourceHash:hash,title:title.trim(),goal:goal.trim(),commandId:crypto.randomUUID()};
    try{
      // Persist the exact command before sending so reopening can recover a lost reply.
      localStorage.setItem(key,JSON.stringify(intent));setPending(intent);
      const result=await request<{conversation:Conversation}>(`/runs/${encodeURIComponent(intent.sourceId)}/branch`,intent);
      if(mounted.current){setCreated(result.conversation);setOpen(true);setPending(undefined);localStorage.removeItem(key);await refresh();}
    }catch(e){if(mounted.current){if(e instanceof ApiError&&e.status<500){localStorage.removeItem(key);setPending(undefined);}setError(String(e));}}
    finally{active.current=false;if(mounted.current)setBusy(false);}
  }
  if(!sources.length&&!pending&&!conversation?.branch&&!conversation?.importedFrom)return null;
  return <section className="wb-branch">
    {conversation?.importedFrom&&<><p className="wb-caption">导入来源：原件 {conversation.importedFrom.importId.slice(0,8)} · 历史节点 {conversation.importedFrom.sourceEntryId}</p><InheritedHistory conversationId={conversation.id} origin="import"/></>}
    {conversation?.branch&&<p className="wb-caption">分支来源：执行 {conversation.branch.sourceRunId.slice(0,8)} · 历史节点 {conversation.branch.sourceEntryId}</p>}
    {conversation?.branch?.sourceConversationId&&<button disabled={openingSource} onClick={()=>void openSource()}>{openingSource?'正在打开来源…':'打开来源话题'}</button>}
    {conversation?.branch&&!conversation.branch.sourceConversationId&&<p className="wb-caption">来源是项目级执行，没有独立话题窗口。</p>}
    {sourceError&&<p role="alert">{sourceError}</p>}
    {conversation?.branch&&<InheritedHistory conversationId={conversation.id}/>}
    <button aria-expanded={open} onClick={()=>setOpen(!open)}>从历史另开话题</button>
    {(open||pending)&&<div className="wb-branch-form">
      <p>选择历史位置，在新窗口继续。新目标会立即提交执行，原话题保留。</p>
      {created?<><p role="status">已创建：{created.title}</p><button onClick={()=>onOpen(created)}>打开新话题</button></>:<>
        <label>历史执行<select aria-label="历史执行" value={source} disabled={busy||!!pending} onChange={e=>{if(e.target.value)void load(e.target.value);}}><option value="">选择一次执行</option>{sources.map(r=><option key={r.id} value={r.id}>{new Date(r.createdAt).toLocaleString()} · {r.id.slice(0,8)}</option>)}</select></label>
        {source&&<div><a href={`/api/runs/${encodeURIComponent(source)}/native-export?projectId=${encodeURIComponent(projectId)}`} target="_blank" rel="noreferrer">导出原生会话</a><p className="wb-caption">导出包含此文件的完整历史、未选分支和内嵌图片。</p></div>}
        <BranchTree key={source} points={points} selected={selected} onSelect={setSelected} disabled={busy||!!pending} name={`branch-${conversation?.id}`}/>
        {source&&!busy&&!points.length&&<p>没有可选择的历史消息。</p>}
        {offset!==undefined&&<button disabled={busy||!!pending} onClick={()=>void load(source,offset)}>更多历史节点</button>}
        <label>新话题名称<input aria-label="新话题名称" maxLength={120} value={title} disabled={busy||!!pending} onChange={e=>setTitle(e.target.value)}/></label>
        <label>分支新目标<textarea aria-label="分支新目标" value={goal} disabled={busy||!!pending} onChange={e=>setGoal(e.target.value)}/></label>
        {pending&&<p role="status">提交结果待确认：{pending.title}。重试会使用同一命令。</p>}
        <button disabled={busy||(!pending&&(!enabled||!selected||!title.trim()||!goal.trim()))} onClick={()=>void submit()}>{busy?'处理中…':pending?'重试创建分支':'创建并执行分支'}</button>
      </>}
      {error&&<p role="alert">{error}</p>}
    </div>}
  </section>;
}

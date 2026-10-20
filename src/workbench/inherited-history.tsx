import React,{useEffect,useRef,useState} from 'react';
import type {NativeBranchPage,NativeBranchPoint} from '../../shared/native-branch';
import {request} from './client';
import {InheritedTools} from './inherited-tools';
import {InheritedText} from './inherited-text';
import {InheritedImages} from './inherited-images';

function ContextEditNotice({point}:{point:NativeBranchPoint}){
  if(!point.contextEdit)return null;
  return <p className="wb-caption">目标节点 {point.contextEdit.targetId} · {point.contextEdit.removed?'移除其模型上下文内容':'替换其模型上下文内容'}。这是原始编辑记录，是否生效还取决于后续编辑和压缩。</p>;
}

export function InheritedHistory({conversationId,origin='branch'}:{conversationId:string;origin?:'branch'|'import'}){
  const [open,setOpen]=useState(false),[points,setPoints]=useState<NativeBranchPoint[]>([]),[next,setNext]=useState<number>(),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const abort=useRef<AbortController|undefined>(undefined);
  useEffect(()=>()=>abort.current?.abort(),[]);
  async function load(offset=0){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    try{const page=await request<NativeBranchPage>(`/conversations/${encodeURIComponent(conversationId)}/inherited-history?offset=${offset}`,undefined,'GET',controller.signal);
      if(!controller.signal.aborted){setPoints(old=>offset?[...old,...page.points]:page.points);setNext(page.nextOffset);setLoaded(true);}
    }catch(e){if(!controller.signal.aborted)setError(String(e));}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="wb-inherited-history"><button aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&!loaded&&!busy)void load();}}>{origin==='import'?'导入起点历史预览':'分支起点历史预览'}</button>
    {open&&<div aria-label={origin==='import'?'导入继承历史':'分支继承历史'}><p className="wb-caption">显示所选节点的原始祖先记录，包含旧消息、工具和上下文编辑记录；模型使用经过压缩和编辑后的上下文。此处不是最终模型输入。</p>
      {points.map(p=><article key={p.entryId} className={`wb-message ${p.role}`}><span>{p.contextEdit?(p.contextEdit.removed?'上下文移除':'上下文替换'):p.summary?(p.summary.kind==='compaction'?'上下文压缩':'分支摘要'):(p.role==='user'?'你':p.role==='toolResult'?'工具返回':'Pi')} · 原历史</span>{p.summary?.kind==='compaction'&&<p className="wb-caption">{p.summary.currentCheckpoint?'所选路径的最新压缩记录':'较早的压缩记录'}{p.summary.tokensBefore!==undefined?` · 压缩前 ${p.summary.tokensBefore} tokens`:''}{p.summary.firstKeptEntryId?` · 保留起点 ${p.summary.firstKeptEntryId}`:''}</p>}<ContextEditNotice point={p}/><InheritedTools point={p} conversationId={conversationId}/><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{p.preview||'（无文字内容）'}</p>{p.truncated&&<InheritedText conversationId={conversationId} entryId={p.entryId}/>} {p.imageCount>0&&<InheritedImages conversationId={conversationId} entryId={p.entryId} count={p.imageCount}/>}</article>)}
      {busy&&<p role="status">正在读取分支历史…</p>}{error&&<><p role="alert">{error}</p><button disabled={busy} onClick={()=>void load()}>重新读取历史</button></>}
      {next!==undefined&&!error&&<button disabled={busy} onClick={()=>void load(next)}>更多继承历史</button>}
      {loaded&&!points.length&&!error&&<p>没有可展示的对话文字。</p>}
    </div>}
  </div>;
}

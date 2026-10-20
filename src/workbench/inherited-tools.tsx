import React,{useEffect,useRef,useState} from 'react';
import type {NativeBranchPage,NativeBranchPoint} from '../../shared/native-branch';
import {InheritedText} from './inherited-text';
import {request} from './client';
export function InheritedTools({point,conversationId}:{point:NativeBranchPoint;conversationId:string}){
  const [page,setPage]=useState(point),[busy,setBusy]=useState(false),[error,setError]=useState('');const abort=useRef<AbortController|undefined>(undefined);
  useEffect(()=>()=>abort.current?.abort(),[]);
  const offset=page.toolCallsOffset??0;const total=page.toolCallCount??0;
  async function load(next:number){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    try{
      const result=await request<NativeBranchPage>(`/conversations/${encodeURIComponent(conversationId)}/inherited-history?entryId=${encodeURIComponent(point.entryId)}&toolCallsOffset=${next}`,undefined,'GET',controller.signal);
      const nextPage=result.points[0];if(!nextPage||nextPage.entryId!==point.entryId)throw new Error('历史工具分页响应不完整');
      if(!controller.signal.aborted)setPage(nextPage);
    }catch(e){if(!controller.signal.aborted)setError(String(e));}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <div aria-label="历史工具记录">{point.toolResult&&<p className="wb-caption">工具：{point.toolResult.name} · {point.toolResult.isError?'记录为错误返回':'记录为正常返回'} · 调用 {point.toolResult.callId||'未记录'}</p>}
    {page.toolCalls?.map((call,index)=><details key={`${call.id}:${offset+index}`}><summary>历史工具调用：{call.name}</summary><p className="wb-caption">调用 {call.id||'未记录'} · 仅查看记录</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{call.preview}</pre>{call.truncated&&<InheritedText conversationId={conversationId} entryId={point.entryId} toolCallIndex={offset+index}/>}</details>)}
    {total>20&&<p>本条共 {total} 次工具调用，当前显示 {offset+1}–{Math.min(offset+20,total)}。</p>}
    {offset>0&&<button disabled={busy} onClick={()=>void load(Math.max(0,offset-20))}>上一组工具调用</button>}
    {offset+20<total&&<button disabled={busy} onClick={()=>void load(offset+20)}>下一组工具调用</button>}
    {busy&&<p role="status">正在读取工具记录…</p>}{error&&<p role="alert">{error}</p>}
  </div>;
}

import React,{useEffect,useRef,useState} from 'react';
import type {NativeBranchPage,NativeHistoryText} from '../../shared/native-branch';
import {request} from './client';

export function InheritedText({conversationId,entryId,toolCallIndex}:{conversationId:string;entryId:string;toolCallIndex?:number}){
  const [open,setOpen]=useState(false),[page,setPage]=useState<NativeHistoryText>(),[offsets,setOffsets]=useState([0]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const abort=useRef<AbortController|undefined>(undefined);useEffect(()=>()=>abort.current?.abort(),[]);
  async function load(target:number[]){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setError('');
    try{const result=await request<NativeBranchPage>(`/conversations/${encodeURIComponent(conversationId)}/inherited-history?entryId=${encodeURIComponent(entryId)}&textOffset=${target.at(-1)??0}${toolCallIndex===undefined?'':`&toolCallIndex=${toolCallIndex}`}`,undefined,'GET',controller.signal);
      if(!result.detail)throw new Error('历史全文响应不完整');
      if(!controller.signal.aborted){setPage(result.detail);setOffsets(target);}
    }catch(e){if(!controller.signal.aborted)setError(String(e));}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <div><button aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&!page&&!busy)void load([0]);}}>{open?'收起历史全文':'阅读历史全文'}</button>{open&&<div aria-label="历史全文">
    {page&&<><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{page.text}</p><small>第 {offsets.length} 段{page.nextOffset===undefined?' · 已到末尾':''}</small></>}
    {busy&&<p role="status">正在读取全文…</p>}
    {offsets.length>1&&<button disabled={busy} onClick={()=>void load(offsets.slice(0,-1))}>上一段</button>}
    {page?.nextOffset!==undefined&&<button disabled={busy} onClick={()=>void load([...offsets,page.nextOffset!])}>下一段</button>}
    {error&&<><p role="alert">{error}</p><button disabled={busy} onClick={()=>void load(offsets)}>重试读取全文</button></>}
  </div>}</div>;
}

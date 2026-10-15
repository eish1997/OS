import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/contracts';
import { appendLayoutCopy, validateLayout, type LayoutRecord, type WorkbenchLayout } from '../../shared/workbench-layout';
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export async function request<T>(path:string,data?:unknown,method='POST',signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api'+path,{method:data===undefined?'GET':method,headers:data===undefined?undefined:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal});
  const value=await response.json();if(!response.ok)throw new ApiError(value.error||'请求失败',response.status);return value;
}
export function useWorkbenchData(){
  const [authenticated,setAuthenticated]=useState<boolean>();const [snapshot,setSnapshot]=useState<Snapshot>();const [connection,setConnection]=useState('连接中');const [error,setError]=useState('');
  const refresh=useCallback(async()=>{try{const s=await request<Snapshot>('/snapshot');setSnapshot(old=>old&&old.cursor>s.cursor?old:s);}catch(e){if(e instanceof ApiError&&e.status===401){setAuthenticated(false);setSnapshot(undefined);}throw e;}},[]);
  useEffect(()=>{const c=new AbortController();request<{loggedIn:boolean}>('/auth',undefined,'GET',c.signal).then(r=>setAuthenticated(r.loggedIn)).catch(e=>{if(!c.signal.aborted)setError(String(e));});return()=>c.abort();},[]);
  useEffect(()=>{
    if(!authenticated)return;let source:EventSource|undefined;let stopped=false;let busy=false;let again=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const update=async()=>{if(busy){again=true;return;}busy=true;try{await refresh();}catch(e){if(!stopped)setError(String(e));}finally{busy=false;if(again&&!stopped){again=false;void update();}}};
    const open=()=>{if(stopped)return;source=new EventSource('/api/events?after=0');source.onopen=()=>{setConnection('已连接');setError('');void update();};source.onmessage=()=>void update();source.onerror=()=>{source?.close();setConnection('正在重连');void update();timer=setTimeout(open,2500);};};
    void update();open();return()=>{stopped=true;source?.close();clearTimeout(timer);};
  },[authenticated,refresh]);
  return {authenticated,setAuthenticated,snapshot,refresh,connection,error};
}
const CACHE='wb-layout-v1-cache';
export function useLayoutStorage(enabled:boolean){
  const [layout,setLayout]=useState<WorkbenchLayout>();const [status,setStatus]=useState('加载布局');const [error,setError]=useState('');const [conflict,setConflict]=useState(false);
  const ref=useRef<{layout?:WorkbenchLayout;revision:number;generation:number;dirty:boolean;blocked:boolean}>({revision:0,generation:0,dirty:false,blocked:false});
  const saving=useRef(false);const [pulse,setPulse]=useState(0);const previous=useRef<WorkbenchLayout|undefined>(undefined);
  const copying=useRef(false);
  const cache=()=>{try{sessionStorage.setItem(CACHE,JSON.stringify(ref.current));}catch{setError('浏览器恢复缓存写入失败，请保留页面并重试服务端保存');}};
  const reload=useCallback(async()=>{
    const record=await request<LayoutRecord>('/workbench/config');validateLayout(record.layout);ref.current={layout:record.layout,revision:record.revision,generation:0,dirty:false,blocked:false};previous.current=record.previous;setLayout(record.layout);setConflict(false);setError(record.recovery||'');setStatus('已保存');
    try{sessionStorage.removeItem(CACHE);}catch{}
  },[]);
  useEffect(()=>{
    if(!enabled)return;let stopped=false;
    request<LayoutRecord>('/workbench/config').then(record=>{if(stopped)return;validateLayout(record.layout);previous.current=record.previous;let chosen=record.layout,dirty=false,blocked=false;
      try{const local=JSON.parse(sessionStorage.getItem(CACHE)||'null');if(local?.dirty){validateLayout(local.layout);chosen=local.layout;dirty=true;blocked=local.revision!==record.revision;}}catch{setError('本地恢复缓存无效，已读取服务端布局');}
      ref.current={layout:chosen,revision:record.revision,generation:0,dirty,blocked};setLayout(chosen);setConflict(blocked);setStatus(blocked?'布局冲突':dirty?'待保存':'已保存');if(record.recovery)setError(record.recovery);
    }).catch(e=>{if(!stopped)setError(String(e));});return()=>{stopped=true;};
  },[enabled]);
  const change=useCallback((fn:(l:WorkbenchLayout)=>WorkbenchLayout)=>{
    if(copying.current){setError('正在另存配置，请稍候再修改');return;}
    const state=ref.current;if(!state.layout)return;
    try{const next=fn(state.layout);validateLayout(next);previous.current=state.layout;state.layout=next;state.dirty=true;state.generation++;setLayout(next);setStatus(state.blocked?'布局冲突':'待保存');cache();}catch(e){setError(e instanceof Error?e.message:String(e));}
  },[]);
  const save=useCallback(async()=>{
    const state=ref.current;if(!state.layout||!state.dirty||state.blocked||saving.current)return;
    saving.current=true;const generation=state.generation;const submitted=state.layout;setStatus('保存中');
    try{const saved=await request<LayoutRecord>('/workbench/config',{revision:state.revision,layout:submitted},'PUT');state.revision=saved.revision;state.dirty=state.generation!==generation;setStatus(state.dirty?'待保存':'已保存');setError('');cache();}
    catch(e){setError(e instanceof Error?e.message:String(e));if(e instanceof ApiError&&e.status===409){state.blocked=true;setConflict(true);setStatus('布局冲突');}else setStatus('保存失败');cache();}
    finally{saving.current=false;if(state.dirty&&!state.blocked&&state.generation!==generation)setPulse(n=>n+1);}
  },[]);
  useEffect(()=>{if(!layout)return;const timer=setTimeout(()=>void save(),650);return()=>clearTimeout(timer);},[layout,pulse,save]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(ref.current.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
  const exportLocal=()=>{if(!ref.current.layout)return;const url=URL.createObjectURL(new Blob([JSON.stringify(ref.current.layout,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='工作台布局恢复.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const saveCopy=async()=>{if(saving.current||!ref.current.layout)return;saving.current=true;copying.current=true;setStatus('另存中');try{const remote=await request<LayoutRecord>('/workbench/config');const merged=appendLayoutCopy(remote.layout,ref.current.layout);const saved=await request<LayoutRecord>('/workbench/config',{revision:remote.revision,layout:merged},'PUT');ref.current={layout:saved.layout,revision:saved.revision,generation:0,dirty:false,blocked:false};setLayout(saved.layout);setConflict(false);setStatus('已保存');setError('');cache();}catch(e){setError(String(e));setStatus('另存失败');}finally{saving.current=false;copying.current=false;}};
  return {layout,change,status,error,conflict,reload,save,exportLocal,saveCopy,undo:()=>{const value=previous.current;if(value)change(()=>structuredClone(value));}};
}

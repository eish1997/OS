import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/contracts';
import { appendLayoutCopy, validateLayout, type LayoutRecord, type WorkbenchLayout } from '../../shared/workbench-layout';
import { LayoutAdoption } from './layout-adoption';
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
const LAYOUT_PEERS='wb-layout-peers-v1';
const projectOf=(layout?:WorkbenchLayout)=>layout?.activeProjectId||null;
const announceLayout=(revision:number)=>{try{const channel=new BroadcastChannel(LAYOUT_PEERS);channel.postMessage({type:'layout-saved',revision});channel.close();}catch{}};
export function useLayoutStorage(enabled:boolean){
  const [layout,setLayout]=useState<WorkbenchLayout>();const [status,setStatus]=useState('加载布局');const [error,setError]=useState('');const [conflict,setConflict]=useState(false);
  const ref=useRef<{layout?:WorkbenchLayout;revision:number;generation:number;dirty:boolean;blocked:boolean}>({revision:0,generation:0,dirty:false,blocked:false});
  const saving=useRef(false);const [pulse,setPulse]=useState(0);const previous=useRef<WorkbenchLayout|undefined>(undefined);
  const copying=useRef(false);const adopting=useRef(false);
  const switchRef=useRef<((projectId:string|null)=>Promise<boolean>)|null>(null);
  const adoption=useRef<LayoutAdoption|null>(null);
  if(!adoption.current)adoption.current=new LayoutAdoption(projectId=>switchRef.current?switchRef.current(projectId):Promise.resolve(true));
  const gate=adoption.current;
  const cache=()=>{try{sessionStorage.setItem(CACHE,JSON.stringify(ref.current));}catch{setError('浏览器恢复缓存写入失败，请保留页面并重试服务端保存');}};
  const install=(record:LayoutRecord,dirty=false,blocked=false)=>{
    ref.current={layout:record.layout,revision:record.revision,generation:0,dirty,blocked};previous.current=record.previous;setLayout(record.layout);setConflict(blocked);setError(record.recovery||'');setStatus(blocked?'布局冲突':dirty?'待保存':'已保存');
    if(!dirty){try{sessionStorage.removeItem(CACHE);}catch{}}
  };
  const reload=useCallback(async()=>{
    const owner=gate.claim(),editedAt=gate.editStamp;
    try{
      const record=await request<LayoutRecord>('/workbench/config');validateLayout(record.layout);
      if(!gate.owns(owner)||!ref.current.layout)return;
      const outcome=await gate.commit(owner,projectOf(ref.current.layout),projectOf(record.layout),editedAt,()=>install(record));
      if(outcome==='stale')setError('布局在切换期间已更改，已保留当前编辑');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  },[gate]);
  useEffect(()=>{
    if(!enabled)return;let stopped=false;
    request<LayoutRecord>('/workbench/config').then(record=>{if(stopped)return;validateLayout(record.layout);previous.current=record.previous;let chosen=record.layout,dirty=false,blocked=false;
      try{const local=JSON.parse(sessionStorage.getItem(CACHE)||'null');if(local?.dirty){validateLayout(local.layout);chosen=local.layout;dirty=true;blocked=local.revision!==record.revision;}}catch{setError('本地恢复缓存无效，已读取服务端布局');}
      ref.current={layout:chosen,revision:record.revision,generation:0,dirty,blocked};setLayout(chosen);setConflict(blocked);setStatus(blocked?'布局冲突':dirty?'待保存':'已保存');if(record.recovery)setError(record.recovery);
    }).catch(e=>{if(!stopped)setError(String(e));});return()=>{stopped=true;};
  },[enabled]);
  useEffect(()=>{
    if(!enabled||typeof BroadcastChannel==='undefined')return;
    const channel=new BroadcastChannel(LAYOUT_PEERS);
    channel.onmessage=event=>{
      if(event.data?.type!=='layout-saved')return;
      const remote=Number(event.data.revision);
      if(!Number.isSafeInteger(remote)||remote<=ref.current.revision)return;
      if(ref.current.dirty)setError('其他标签页已更新布局；本地仍有未保存更改，请另存或重新加载');
      else setError('其他标签页已更新布局，可重新加载同步');
    };
    return()=>channel.close();
  },[enabled]);
  const change=useCallback((fn:(l:WorkbenchLayout)=>WorkbenchLayout)=>{
    if(copying.current){setError('正在另存配置，请稍候再修改');return;}
    const state=ref.current;if(!state.layout)return;
    try{
      const next=fn(state.layout);validateLayout(next);
      const from=projectOf(state.layout),to=projectOf(next);
      const publish=()=>{const latest=ref.current;if(!latest.layout)return;previous.current=latest.layout;latest.layout=next;latest.dirty=true;latest.generation++;setLayout(next);setStatus(latest.blocked?'布局冲突':'待保存');cache();};
      if(switchRef.current&&!adopting.current&&from!==to){
        const owner=gate.claim(),editedAt=gate.editStamp;
        void gate.commit(owner,from,to,editedAt,()=>publish()).then(outcome=>{if(outcome==='stale')setError('布局在切换期间已更改，已保留当前编辑');}).catch(e=>setError(e instanceof Error?e.message:String(e)));
        return;
      }
      if(!adopting.current)gate.noteEdit();
      publish();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  },[gate]);
  const save=useCallback(async()=>{
    const state=ref.current;if(!state.layout||!state.dirty||state.blocked||saving.current)return;
    saving.current=true;const generation=state.generation;const submitted=state.layout;setStatus('保存中');
    try{const saved=await request<LayoutRecord>('/workbench/config',{revision:state.revision,layout:submitted},'PUT');state.revision=saved.revision;state.dirty=state.generation!==generation;setStatus(state.dirty?'待保存':'已保存');setError('');cache();if(!state.dirty)announceLayout(state.revision);}
    catch(e){setError(e instanceof Error?e.message:String(e));if(e instanceof ApiError&&e.status===409){state.blocked=true;setConflict(true);setStatus('布局冲突');}else setStatus('保存失败');cache();}
    finally{saving.current=false;if(state.dirty&&!state.blocked&&state.generation!==generation)setPulse(n=>n+1);}
  },[]);
  useEffect(()=>{if(!layout)return;const timer=setTimeout(()=>void save(),650);return()=>clearTimeout(timer);},[layout,pulse,save]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(ref.current.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
  const exportLocal=()=>{if(!ref.current.layout)return;const url=URL.createObjectURL(new Blob([JSON.stringify(ref.current.layout,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='工作台布局恢复.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const saveCopy=async()=>{
    if(saving.current||!ref.current.layout)return;saving.current=true;copying.current=true;setStatus('另存中');
    const owner=gate.claim(),editedAt=gate.editStamp,from=projectOf(ref.current.layout);
    try{
      const remote=await request<LayoutRecord>('/workbench/config');
      if(!ref.current.layout||!gate.owns(owner)){setStatus(ref.current.dirty?'待保存':'已保存');return;}
      const merged=appendLayoutCopy(remote.layout,ref.current.layout);validateLayout(merged);
      const outcome=await gate.commit(owner,from,projectOf(merged),editedAt,async stillCurrent=>{
        const saved=await request<LayoutRecord>('/workbench/config',{revision:remote.revision,layout:merged},'PUT');
        if(!stillCurrent())return;
        install(saved);
      });
      if(outcome==='stale'){setError('另存期间布局已更改，已保留当前编辑');setStatus(ref.current.dirty?'待保存':'已保存');}
      else if(outcome==='superseded')setStatus(ref.current.dirty?'待保存':'已保存');
    }catch(e){setError(String(e));setStatus('另存失败');}
    finally{saving.current=false;copying.current=false;}
  };
  return {layout,change,status,error,conflict,reload,save,exportLocal,saveCopy,undo:()=>{const value=previous.current;if(value)change(()=>structuredClone(value));},
    bindCanvasSwitch:(open:((projectId:string|null)=>Promise<boolean>)|null)=>{switchRef.current=open;},
    pendingAdoption:()=>gate.pending,
    claimProjectSwitch:()=>gate.claim(),
    withAdoption:(run:()=>void)=>{adopting.current=true;try{run();}finally{adopting.current=false;}}};
}

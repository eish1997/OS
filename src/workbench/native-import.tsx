import React,{useEffect,useRef,useState} from 'react';
import {request} from './client';
import {hashFile} from './file-hash';
import {NativeImportRestore} from './native-import-restore';
import type {Conversation} from '../../shared/contracts';

type Upload={id:string;name:string;bytes:number;sha256:string;received:number;revoked?:boolean};
type Preview={sessionId:string;messageCount:number;entryCount:number;imageCount:number;compactionCount:number;contextEditCount:number};
type Intent={projectId:string;name:string;bytes:number;sha256:string;commandId:string};
export function NativeImportPanel({projectId,onOpen}:{projectId:string;onOpen?:(conversation:Conversation)=>void}){
  const [open,setOpen]=useState(false),[rows,setRows]=useState<Upload[]>([]),[selected,setSelected]=useState(''),[file,setFile]=useState<File>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[preview,setPreview]=useState<Preview>();
  const control=useRef<AbortController|null>(null);const live=useRef(true);const key=`wb-native-import-v1:${projectId}`;
  useEffect(()=>{live.current=true;return()=>{live.current=false;control.current?.abort();};},[]);
  const endpoint=(id:string)=>`/native-imports/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`;
  async function refresh(signal?:AbortSignal){const result=await request<Upload[]>(`/native-imports?projectId=${encodeURIComponent(projectId)}`,undefined,'GET',signal);if(live.current)setRows(result);}
  async function act(work:(signal:AbortSignal)=>Promise<void>){
    if(control.current)return;const controller=new AbortController();control.current=controller;setBusy(true);setError('');
    try{
      if(!navigator.locks)throw new Error('当前浏览器不支持安全续传，请使用新版 Chrome 或 Edge');
      await navigator.locks.request(key,{ifAvailable:true},async lock=>{if(!lock)throw new Error('另一窗口正在处理本项目的导入，请稍后刷新');await work(controller.signal);});
    }catch(e){if(live.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:String(e));}
    finally{control.current=null;if(live.current){setBusy(false);if(controller.signal.aborted)setStatus('已暂停，可重新选择原文件继续上传。');}}
  }
  async function upload(signal:AbortSignal){
    if(!file)throw new Error('请先选择原生会话文件');
    if(!file.name.endsWith('.jsonl')||!file.size||file.size>128*1024*1024)throw new Error('请选择不超过128 MiB的JSONL文件');
    setPreview(undefined);
    const sha256=await hashFile(file,signal,(read,total)=>setStatus(`正在校验所选文件：${read} / ${total} 字节`));
    let record:Upload;
    if(selected){record=await request<Upload>(endpoint(selected),undefined,'GET',signal);if(record.sha256!==sha256||record.bytes!==file.size)throw new Error('所选文件与原上传内容不一致，请重新选择原文件');}
    else{
      const saved=localStorage.getItem(key);const intent:Intent=saved?JSON.parse(saved):{projectId,name:file.name,bytes:file.size,sha256,commandId:crypto.randomUUID()};
      if(intent.projectId!==projectId||intent.sha256!==sha256||intent.bytes!==file.size)throw new Error('有创建结果待确认的上传，请重新选择上次的同一文件');
      localStorage.setItem(key,JSON.stringify(intent));
      const created=await request<Upload>('/native-imports',intent,'POST',signal);record=await request<Upload>(endpoint(created.id),undefined,'GET',signal);
      localStorage.removeItem(key);setSelected(record.id);
    }
    if(record.revoked)throw new Error('该导入已撤销，请选择新建导入');
    while(record.received<file.size){
      signal.throwIfAborted();setStatus(`正在上传：${record.received} / ${file.size} 字节`);
      const response=await fetch('/api'+endpoint(record.id)+`&offset=${record.received}`,{method:'PUT',body:file.slice(record.received,record.received+1024*1024),signal});
      const value=await response.json();if(!response.ok)throw new Error(value.error||'上传失败，可刷新后续传');record=value;
    }
    setStatus('原件已保存，正在校验历史结构…');await refresh(signal);await inspect(record.id,signal);
  }
  async function inspect(id:string,signal:AbortSignal){
    setPreview(undefined);const result=await request<{preview:Preview}>(`/native-imports/${encodeURIComponent(id)}/preview?projectId=${encodeURIComponent(projectId)}`,undefined,'GET',signal);
    if(live.current){setPreview(result.preview);setStatus('原件已保存，结构校验通过。');}
  }
  const current=rows.find(row=>row.id===selected);
  return <section className="wb-branch">
    <button aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void act(signal=>refresh(signal));}}>导入原生会话</button>
    {open&&<div className="wb-branch-form">
      <p>保存 Pi 原生会话原件并查看校验结果。当前环境尚未核对，此步骤不会启动模型或执行历史命令。</p>
      <label>导入记录<select aria-label="导入记录" value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setPreview(undefined);setStatus('');setFile(undefined);}}><option value="">新建导入</option>{rows.map(row=><option key={row.id} value={row.id}>{row.name} · {row.revoked?'已撤销':`${row.received}/${row.bytes} 字节`} · {row.id.slice(0,8)}</option>)}</select></label>
      <button disabled={busy} onClick={()=>void act(signal=>refresh(signal))}>刷新导入记录</button>
      <label>原生会话文件<input key={selected} aria-label="原生会话文件" type="file" accept=".jsonl" disabled={busy||current?.revoked} onChange={e=>setFile(e.target.files?.[0])}/></label>
      <p className="wb-caption">上传中断后，选择对应记录并重新选择原文件，可从已保存位置继续。</p>
      <button disabled={busy||!file||current?.revoked} onClick={()=>void act(upload)}>{selected?'继续上传并校验':'保存原件并校验'}</button>
      {busy&&<button onClick={()=>control.current?.abort()}>暂停导入</button>}
      {current&&!current.revoked&&current.received===current.bytes&&<button disabled={busy} onClick={()=>void act(signal=>inspect(current.id,signal))}>查看导入预览</button>}
      {current&&(!current.revoked||current.received>0)&&<button disabled={busy} onClick={()=>void act(async signal=>{await request(endpoint(current.id),{},'DELETE',signal);setPreview(undefined);setStatus('已撤销，服务端导入副本已删除，本地原文件保留。');await refresh(signal);})}>撤销并删除导入副本</button>}
      {status&&<p role="status">{status}</p>}{error&&<p role="alert">{error}</p>}
      {preview&&<div aria-label="导入校验预览"><p>历史条目 {preview.entryCount} · 消息 {preview.messageCount} · 图片 {preview.imageCount}</p><p>压缩记录 {preview.compactionCount} · 上下文编辑 {preview.contextEditCount}</p></div>}
      {current&&!current.revoked&&current.received===current.bytes&&onOpen&&<NativeImportRestore key={current.id} projectId={projectId} importId={current.id} sha256={current.sha256} onOpen={onOpen}/>}
    </div>}
  </section>;
}

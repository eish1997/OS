import React,{useEffect,useRef,useState} from 'react';
import type {Asset,Snapshot} from '../../shared/contracts';
import {ApiError,request} from './client';
type Intent={projectId:string;name:string;mime:string;expectedHash:string;commandId:string;size:number};
function readIntent(key:string,projectId:string):Intent|undefined{
  try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.projectId===projectId&&typeof value.name==='string'&&typeof value.mime==='string'&&/^[a-f0-9]{64}$/.test(value.expectedHash)&&typeof value.commandId==='string'&&Number.isSafeInteger(value.size)&&value.size>=0&&value.size<=10*1024*1024)return value;}catch{/* New uploads must save successfully before sending. */}
}
export function ImageUpload({projectId,conversationId,disabled,onBusy,onError,onUploaded}:{projectId:string;conversationId:string;disabled:boolean;onBusy:(value:boolean)=>void;onError:(value:string)=>void;onUploaded:(asset:Asset)=>void}){
  const key=`wb-image-upload-v1:${projectId}:${conversationId}`;
  const picker=useRef<HTMLInputElement>(null);const mounted=useRef(true);
  const [pending,setPending]=useState(()=>readIntent(key,projectId));const current=useRef(pending);const operating=useRef(false);
  useEffect(()=>{
    mounted.current=true;
    const sync=(event:StorageEvent)=>{if(event.key!==key)return;const intent=readIntent(key,projectId);current.current=intent;setPending(intent);};
    window.addEventListener('storage',sync);
    return()=>{mounted.current=false;window.removeEventListener('storage',sync);};
  },[key,projectId]);
  function save(intent?:Intent){if(intent)localStorage.setItem(key,JSON.stringify(intent));else localStorage.removeItem(key);current.current=intent;if(mounted.current)setPending(intent);}
  async function create(intent:Intent){
    try{return await request<{id:string}>('/uploads',intent,'POST',AbortSignal.timeout(10000));}
    catch(error){if(error instanceof ApiError&&error.status<500)throw error;return request<{id:string}>('/uploads',intent,'POST',AbortSignal.timeout(10000));}
  }
  async function lookup(id:string,intent:Intent){
    const receipt=await request<{state:string;assetId?:string;projectId:string}>(`/uploads/${encodeURIComponent(id)}`,undefined,'GET',AbortSignal.timeout(10000));
    if(receipt.projectId!==intent.projectId)throw new Error('上传记录不属于原项目');
    if(receipt.state!=='done'||!receipt.assetId)return undefined;
    const snapshot=await request<Snapshot>('/snapshot',undefined,'GET',AbortSignal.timeout(10000));const asset=snapshot.assets.find(item=>item.id===receipt.assetId);
    if(!asset)throw new Error('图片已保存，但暂时无法读取，请在项目资产中查看');return asset;
  }
  function attach(asset:Asset,intent:Intent){
    if(asset.projectId!==projectId||asset.hash!==intent.expectedHash||asset.size!==intent.size)throw new Error('上传回执与所选图片不一致');
    if(!mounted.current)return; // Keep recovery metadata when the original chat closes.
    onUploaded(asset);save();
  }
  async function operate(action:()=>Promise<void>){
    if(operating.current)return;operating.current=true;onBusy(true);onError('');
    const perform=async()=>{if(!mounted.current)return;const latest=readIntent(key,projectId);current.current=latest;setPending(latest);await action();};
    try{
      if(navigator.locks)await navigator.locks.request(key,{ifAvailable:true},async lock=>{if(!lock)throw new Error('另一页面正在处理此聊天的图片，请等待完成后再试');await perform();});
      else await perform();
    }catch(error){if(mounted.current)onError(String(error));}finally{operating.current=false;if(mounted.current)onBusy(false);}
  }
  async function upload(file:File){await operate(async()=>{
    if(file.size>10*1024*1024)throw new Error('单张图片不能超过10 MB');
    const extension=file.name.split('.').at(-1)?.toLowerCase();const mime=file.type||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'} as Record<string,string>)[extension??''];
    if(!['image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw new Error('请选择PNG、JPEG、GIF或WebP图片');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
    const intent=current.current??{projectId,name:file.name,mime,expectedHash:hash,commandId:crypto.randomUUID(),size:file.size};
    if(intent.expectedHash!==hash||intent.size!==file.size)throw new Error('请重新选择待恢复的同一图片，或取消本次附加后选择其他图片');
    if(!mounted.current)return;save(intent);const upload=await create(intent);if(!mounted.current)return;
    let asset:Asset;
    try{const response=await fetch(`/api/uploads/${encodeURIComponent(upload.id)}`,{method:'PUT',body:file,headers:{'X-Content-Hash':hash},signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'图片上传失败');asset=result as Asset;}
    catch(error){const found=await lookup(upload.id,intent);if(!found)throw error;asset=found;}
    attach(asset,intent);
  });}
  async function recover(){await operate(async()=>{const intent=current.current;if(!intent)return;const upload=await create(intent);const asset=await lookup(upload.id,intent);if(!asset)throw new Error('图片内容尚未上传完成，请重新选择同一图片继续上传');attach(asset,intent);});}
  return <><input ref={picker} type="file" aria-label="选择聊天图片" accept="image/png,image/jpeg,image/gif,image/webp" hidden disabled={disabled} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void upload(file);}}/><button disabled={disabled} onClick={()=>picker.current?.click()}>添加图片</button>{pending&&<div className="wb-upload-recovery"><small>待恢复图片：{pending.name}</small><button disabled={disabled} onClick={()=>void recover()}>恢复图片上传</button><button disabled={disabled} onClick={()=>void operate(async()=>save())}>取消本次附加</button></div>}</>;
}

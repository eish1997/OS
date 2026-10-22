import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import type {Asset,Snapshot} from '../../shared/contracts';
import {ApiError,request} from './client';

type Intent={projectId:string;name:string;mime:string;expectedHash:string;commandId:string;size:number};
export type ImageUploadHandle={uploadFiles:(files:Iterable<File>)=>Promise<void>};
type UploadPhase='idle'|'hashing'|'uploading'|'recovering';

const IMAGE_MIME=new Set(['image/png','image/jpeg','image/gif','image/webp']);

function readIntent(key:string,projectId:string):Intent|undefined{
  try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.projectId===projectId&&typeof value.name==='string'&&typeof value.mime==='string'&&/^[a-f0-9]{64}$/.test(value.expectedHash)&&typeof value.commandId==='string'&&Number.isSafeInteger(value.size)&&value.size>=0&&value.size<=10*1024*1024)return value;}catch{/* New uploads must save successfully before sending. */}
}

function mimeOf(file:File):string|undefined{
  if(file.type&&IMAGE_MIME.has(file.type))return file.type;
  const extension=file.name.split('.').at(-1)?.toLowerCase();
  return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'} as Record<string,string>)[extension??''];
}

export const ImageUpload=forwardRef<ImageUploadHandle,{projectId:string;conversationId:string;disabled:boolean;onBusy:(value:boolean)=>void;onError:(value:string)=>void;onUploaded:(asset:Asset)=>void;onPhase?:(phase:UploadPhase)=>void}>(function ImageUpload({projectId,conversationId,disabled,onBusy,onError,onUploaded,onPhase},ref){
  const key=`wb-image-upload-v1:${projectId}:${conversationId}`;
  const picker=useRef<HTMLInputElement>(null);const mounted=useRef(true);
  const [pending,setPending]=useState(()=>readIntent(key,projectId));const current=useRef(pending);const operating=useRef(false);
  const [phase,setPhase]=useState<UploadPhase>('idle');
  useEffect(()=>{
    mounted.current=true;
    const sync=(event:StorageEvent)=>{if(event.key!==key)return;const intent=readIntent(key,projectId);current.current=intent;setPending(intent);};
    window.addEventListener('storage',sync);
    return()=>{mounted.current=false;window.removeEventListener('storage',sync);};
  },[key,projectId]);
  function setUploadPhase(next:UploadPhase){setPhase(next);onPhase?.(next);}
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
    }catch(error){if(mounted.current)onError(String(error));}finally{operating.current=false;if(mounted.current){onBusy(false);setUploadPhase('idle');}}
  }
  async function upload(file:File){await operate(async()=>{
    if(file.size>10*1024*1024)throw new Error('单张图片不能超过10 MB');
    const mime=mimeOf(file);
    if(!mime||!IMAGE_MIME.has(mime))throw new Error('仅支持 PNG、JPEG、GIF 或 WebP 图片；其他文件不会添加');
    setUploadPhase('hashing');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
    const intent=current.current??{projectId,name:file.name,mime,expectedHash:hash,commandId:crypto.randomUUID(),size:file.size};
    if(intent.expectedHash!==hash||intent.size!==file.size)throw new Error('请重新选择待恢复的同一图片，或取消本次附加后选择其他图片');
    if(!mounted.current)return;save(intent);setUploadPhase('uploading');const upload=await create(intent);if(!mounted.current)return;
    let asset:Asset;
    try{const response=await fetch(`/api/uploads/${encodeURIComponent(upload.id)}`,{method:'PUT',body:file,headers:{'X-Content-Hash':hash},signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'图片上传失败');asset=result as Asset;}
    catch(error){const found=await lookup(upload.id,intent);if(!found)throw error;asset=found;}
    attach(asset,intent);
  });}
  async function recover(){await operate(async()=>{setUploadPhase('recovering');const intent=current.current;if(!intent)return;const upload=await create(intent);const asset=await lookup(upload.id,intent);if(!asset)throw new Error('图片内容尚未上传完成，请重新选择同一图片继续上传');attach(asset,intent);});}
  useImperativeHandle(ref,()=>({
    uploadFiles:async(files)=>{
      const list=[...files];
      if(!list.length)return;
      const unsupported=list.filter(file=>!mimeOf(file)||!IMAGE_MIME.has(mimeOf(file)!));
      if(unsupported.length===list.length){onError('仅支持 PNG、JPEG、GIF 或 WebP 图片；其他文件不会添加');return;}
      if(unsupported.length)onError(`已忽略 ${unsupported.length} 个非图片文件；仅支持 PNG、JPEG、GIF 或 WebP`);
      for(const file of list){if(mimeOf(file)&&IMAGE_MIME.has(mimeOf(file)!))await upload(file);}
    },
  }));
  const phaseLabel=phase==='hashing'?'正在校验图片…':phase==='uploading'?'正在上传图片…':phase==='recovering'?'正在恢复上传…':'';
  return <>
    <input ref={picker} type="file" aria-label="选择聊天图片" accept="image/png,image/jpeg,image/gif,image/webp" hidden disabled={disabled} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void upload(file);}}/>
    <button type="button" disabled={disabled} onClick={()=>picker.current?.click()}>添加图片</button>
    {phaseLabel&&<span className="wb-caption" role="status" data-upload-phase={phase}>{phaseLabel}</span>}
    {pending&&<div className="wb-upload-recovery" data-upload-recovery>
      <small>待恢复图片：{pending.name} · {(pending.size/1024).toFixed(1)} KB</small>
      <button type="button" disabled={disabled} onClick={()=>void recover()}>恢复图片上传</button>
      <button type="button" disabled={disabled} onClick={()=>void operate(async()=>save())}>取消本次附加</button>
    </div>}
  </>;
});

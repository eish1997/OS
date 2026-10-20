import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeFingerprint,type NativeInspectionInput} from './native-inspection.js';
import {nativeInspectionSlot} from './native-inspection-async.js';
import type {inspectNativeImport} from './native-import-inspection.js';
import {AppError} from './store.js';

export type NativeImportPreview=ReturnType<typeof inspectNativeImport>&{effectiveImageCount?:number;workerPeakRss?:number};
export async function prepareNativeImport(input:Omit<NativeInspectionInput,'sessionId'>&{entryId?:string;measure?:boolean},signal?:AbortSignal):Promise<NativeImportPreview>{
  signal?.throwIfAborted();const scoped={...input,sessionId:''};const before=nativeFingerprint(scoped);const release=await nativeInspectionSlot(signal);
  try{return await new Promise<NativeImportPreview>((resolve,reject)=>{
    const child=fork(fileURLToPath(new URL('./native-import-worker.ts',import.meta.url)),[],{execArgv:['--max-old-space-size=768','--import','tsx'],windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH,PI_OFFLINE:'1'}});
    let result:NativeImportPreview|undefined;let failure:Error|undefined;
    const abort=()=>{failure=new AppError(499,'导入校验已取消');child.kill();};
    signal?.addEventListener('abort',abort,{once:true});
    child.on('message',(message:{result?:NativeImportPreview;error?:string;status?:number})=>{if(message.error)failure??=new AppError(message.status??422,message.error);else result=message.result;});
    child.once('error',error=>{failure??=error;});
    child.once('close',code=>{
      signal?.removeEventListener('abort',abort);
      if(failure)return reject(failure);
      if(code!==0||!result)return reject(new AppError(422,'导入校验进程未完成'));
      try{if(nativeFingerprint(scoped).fingerprint!==before.fingerprint)throw new AppError(409,'导入文件在校验期间发生变化');resolve(result);}catch(error){reject(error);}
    });
    if(signal?.aborted)abort();else child.send(input,error=>{if(error){failure??=error;child.kill();}});
  });}finally{release();}
}

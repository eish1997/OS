import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {Writable} from 'node:stream';
import {nativeFingerprint} from './native-inspection.js';
import {nativeInspectionSlot} from './native-inspection-async.js';
import type {BranchPageInput} from './native-branch-points.js';
import {AppError} from './store.js';

type NativeStreamStart=(metadata:{mimeType:string;bytes:number;sha256?:string})=>void;
export const streamNativeImage=(input:BranchPageInput,destination:Writable,start:NativeStreamStart,signal?:AbortSignal)=>streamValidatedNative(input,destination,start,signal,false);
export const streamNativeExport=(input:BranchPageInput,destination:Writable,start:NativeStreamStart,signal?:AbortSignal)=>streamValidatedNative(input,destination,start,signal,true);
/** Only metadata uses IPC. Binary stdout piping preserves downstream backpressure. */
async function streamValidatedNative(input:BranchPageInput,destination:Writable,start:NativeStreamStart,signal:AbortSignal|undefined,exportOriginal:boolean){
  signal?.throwIfAborted();const before=nativeFingerprint(input);const release=await nativeInspectionSlot(signal);
  try{await new Promise<void>((resolve,reject)=>{
    const child=fork(fileURLToPath(new URL('./native-branch-worker.ts',import.meta.url)),[],{execArgv:['--max-old-space-size=768','--import','tsx'],windowsHide:true,stdio:['ignore','pipe','ignore','ipc'],env:{SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH,PI_OFFLINE:'1'}});
    let failure:Error|undefined;let expected:number|undefined;let received=0;
    const stop=(error:Error)=>{failure??=error;child.kill();};
    const abort=()=>stop(new AppError(499,'历史图片读取已取消'));
    const destinationError=(error:Error)=>stop(error);
    signal?.addEventListener('abort',abort,{once:true});destination.once('error',destinationError);
    child.once('error',stop);child.stdout!.once('error',stop);
    child.on('message',(message:{error?:string;status?:number;imageReady?:{mimeType:string;bytes:number;sha256?:string}})=>{
      if(message.error){stop(new AppError(message.status??422,message.error));return;}
      if(!message.imageReady||expected!==undefined)return;
      try{
        if(signal?.aborted)throw new AppError(499,'历史图片读取已取消');
        if(nativeFingerprint(input).fingerprint!==before.fingerprint)throw new AppError(409,'原生会话读取期间发生变化');
        start(message.imageReady);expected=message.imageReady.bytes;
        child.stdout!.on('data',(chunk:Buffer)=>{received+=chunk.length;});
        child.stdout!.pipe(destination,{end:false});child.send({proceed:true});
      }catch(error){stop(error instanceof Error?error:new Error(String(error)));}
    });
    child.once('close',code=>{
      signal?.removeEventListener('abort',abort);destination.removeListener('error',destinationError);child.stdout!.unpipe(destination);
      if(failure)return reject(failure);
      if(code!==0||expected===undefined||received!==expected)return reject(new AppError(422,'历史图片传输未完成'));
      resolve();
    });
    if(signal?.aborted)abort();else child.send({...input,streamImage:true,exportOriginal});
  });}finally{release();}
}

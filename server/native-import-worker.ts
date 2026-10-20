import {inspectNativeImport} from './native-import-inspection.js';
import type {NativeInspectionInput} from './native-inspection.js';
import {AppError} from './store.js';

process.once('message',async(input:Omit<NativeInspectionInput,'sessionId'>&{entryId?:string;measure?:boolean})=>{
  try{
    const preview=inspectNativeImport(input);
    const result=input.entryId?{...preview,effectiveImageCount:await (await import('./native-import-context.js')).importedContextImages({...input,sessionId:preview.sessionId},input.entryId,preview.sha256)}:preview;
    process.send!({result:input.measure?{...result,workerPeakRss:process.resourceUsage().maxRSS*1024}:result},()=>process.disconnect!());
  }
  catch(error){process.send!({error:error instanceof AppError?error.message:'原生会话导入校验失败',status:error instanceof AppError?error.status:422},()=>process.disconnect!());}
});

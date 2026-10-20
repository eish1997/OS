import {scanBranchPoints,type BranchPageInput} from './native-branch-points.js';
import {AppError} from './store.js';
import {readNativeExport} from './native-export.js';
process.once('message',async(input:BranchPageInput&{streamImage?:boolean;exportOriginal?:boolean})=>{
  try{
    if(input.exportOriginal){
      const snapshot=readNativeExport(input);const proceed=new Promise<void>(resolve=>process.once('message',()=>resolve()));
      process.send!({imageReady:{mimeType:'application/x-ndjson',bytes:snapshot.bytes.length,sha256:snapshot.sha256}});await proceed;
      for(let offset=0;offset<snapshot.bytes.length;offset+=65536)await new Promise<void>((resolve,reject)=>process.stdout.write(snapshot.bytes.subarray(offset,offset+65536),error=>error?reject(error):resolve()));
      process.disconnect!();return;
    }
    const result=scanBranchPoints(input);
    if(input.streamImage){
      if(!result.image)throw new AppError(404,'历史图片不存在');
      const {data,mimeType}=result.image;
      const proceed=new Promise<void>(resolve=>process.once('message',()=>resolve()));
      process.send!({imageReady:{mimeType,bytes:Buffer.byteLength(data,'base64')}});
      await proceed;
      for(let offset=0;offset<data.length;offset+=65536){
        const chunk=Buffer.from(data.slice(offset,offset+65536),'base64');
        await new Promise<void>((resolve,reject)=>process.stdout.write(chunk,error=>error?reject(error):resolve()));
      }
      process.disconnect!();
    }else process.send!({result},()=>process.disconnect!());
  }
  catch(error){process.send!({error:error instanceof AppError?error.message:'历史节点读取失败',status:error instanceof AppError?error.status:422},()=>process.disconnect!());}
});

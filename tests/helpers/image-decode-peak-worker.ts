import {readFileSync} from 'node:fs';
import {validateNativeImage} from '../../server/native-image-validation.js';

process.once('message',async(job:{path:string;width:number;height:number})=>{
  try{
    const bytes=readFileSync(job.path);
    const before=process.resourceUsage().maxRSS*1024;
    await validateNativeImage(bytes.toString('base64'),'image/png');
    const usage=process.memoryUsage();
    process.send!({before,peakRss:process.resourceUsage().maxRSS*1024,rss:usage.rss,heapUsed:usage.heapUsed,encodedBytes:bytes.length,surfaceBytes:job.width*job.height*4});
  }catch(error){process.send!({error:error instanceof Error?error.message:String(error)});process.exitCode=1;}
  finally{process.disconnect!();}
});

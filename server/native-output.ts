import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export function createRunOutputDirectory(dataDir:string,projectId:string,runId:string){
  if(!/^[a-zA-Z0-9-]+$/.test(projectId)||!/^[a-zA-Z0-9-]+$/.test(runId))throw new Error('输出目录归属无效');
  let current=realpathSync(dataDir);
  for(const segment of ['sessions',projectId,'.output',runId]){
    current=join(current,segment);
    if(!existsSync(current))mkdirSync(current);
    if(lstatSync(current).isSymbolicLink()||!lstatSync(current).isDirectory()||realpathSync(current)!==current)throw new Error('输出目录不能包含链接');
  }
  return current;
}

/** Only native command output in this worker's private temp directory is eligible. */
export async function* nativeOutputChunks(directory:string,path:string,tool:string):AsyncGenerator<string>{
  if(!['bash','powershell'].includes(tool)||typeof path!=='string'||!isAbsolute(path)||path.includes('\0')||dirname(resolve(path))!==resolve(directory)||!new RegExp(`^pi-${tool}-[a-f0-9]{16}\\.log$`).test(basename(path)))throw new Error('原始工具输出路径不属于本次执行');
  if((await lstat(directory)).isSymbolicLink()||realpathSync(directory)!==resolve(directory))throw new Error('输出目录已变化');
  const fileInfo=await lstat(path,{bigint:true});
  if(fileInfo.isSymbolicLink()||!fileInfo.isFile()||fileInfo.nlink!==1n||fileInfo.size>128n*1024n*1024n)throw new Error('原始输出不是受支持的普通文件或超过128MiB');
  const file=await open(path,'r');
  const same=(a:typeof fileInfo,b:typeof fileInfo)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
  try{
    if(!same(fileInfo,await file.stat({bigint:true})))throw new Error('输出文件在打开时变化');
    const decoder=new StringDecoder('utf8');const buffer=Buffer.alloc(8192);let position=0;
    const length=Number(fileInfo.size);
    while(position<length){const {bytesRead}=await file.read(buffer,0,Math.min(buffer.length,length-position),position);if(!bytesRead)break;position+=bytesRead;const text=decoder.write(buffer.subarray(0,bytesRead));if(text)yield text;}
    const tail=decoder.end();if(tail)yield tail;
    if(!same(fileInfo,await file.stat({bigint:true}))||!same(fileInfo,await lstat(path,{bigint:true})))throw new Error('输出文件归档期间变化');
  }finally{await file.close();}
}

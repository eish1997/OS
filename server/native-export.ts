import {openSync,readSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {scanNative,nativeFingerprint,type NativeInspectionInput} from './native-inspection.js';
import {AppError} from './store.js';

/** Runs only inside the bounded scanner process; returns exact, validated file bytes. */
export function readNativeExport(input:NativeInspectionInput){
  const inspected=scanNative(input);const fd=openSync(input.path,'r');
  try{
    const bytes=Buffer.allocUnsafe(inspected.bytes);let offset=0;
    while(offset<bytes.length){const count=readSync(fd,bytes,offset,Math.min(65536,bytes.length-offset),offset);if(!count)throw new AppError(409,'原生会话导出期间发生变化');offset+=count;}
    if(readSync(fd,Buffer.alloc(1),0,1,offset)!==0)throw new AppError(409,'原生会话导出期间发生变化');
    if(nativeFingerprint(input).fingerprint!==inspected.fingerprint||createHash('sha256').update(bytes).digest('hex')!==inspected.sha256)throw new AppError(409,'原生会话导出期间发生变化');
    return {bytes,sha256:inspected.sha256};
  }finally{closeSync(fd);}
}

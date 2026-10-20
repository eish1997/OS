import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {crc32,deflateSync} from 'node:zlib';
import {nativeSessionMaximum} from '../server/native-inspection.js';

function solidPng(width:number,height:number){
  const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]);const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(body)>>>0);return Buffer.concat([size,body,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const row=Buffer.alloc(1+width*3);row.fill(40,1);const raw=Buffer.alloc(row.length*height);
  for(let y=0;y<height;y++)row.copy(raw,y*row.length);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

test('a near-boundary PNG decodes under the existing RGBA surface limit',{timeout:180000},async()=>{
  const width=4096,height=4096,surface=width*height*4;
  assert(surface<nativeSessionMaximum);
  const root=mkdtempSync(join(tmpdir(),'image-peak-'));const path=join(root,'solid.png');writeFileSync(path,solidPng(width,height));
  const child=fork(fileURLToPath(new URL('./helpers/image-decode-peak-worker.ts',import.meta.url)),[],{execArgv:['--import','tsx'],windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const result=await new Promise<Record<string,number|string>>((resolve,reject)=>{
    child.once('message',message=>resolve(message as Record<string,number|string>));
    child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error(`decoder exited ${code}`));});
    child.send({path,width,height});
  });
  try{
    assert.equal(result.error,undefined,String(result.error??''));
    assert.equal(result.surfaceBytes,surface);
    const output='output/dev-evidence/pi-parity/image-formats';mkdirSync(output,{recursive:true});
    writeFileSync(join(output,'decode-peak.json'),JSON.stringify({width,height,surfaceBytes:surface,limit:nativeSessionMaximum,...result},null,2));
    assert(Number(result.peakRss)>0);
  }finally{if(child.exitCode===null)child.kill();rmSync(root,{recursive:true,force:true});}
});

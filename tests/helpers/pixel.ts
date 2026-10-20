import {crc32,deflateSync} from 'node:zlib';
/** Owned RGB PNG with checksums generated from its chunks, not an opaque pasted fixture. */
export function pixelPng(){
  const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]);const size=Buffer.alloc(4);size.writeUInt32BE(data.length);const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(body));return Buffer.concat([size,body,checksum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0]))),chunk('IEND',Buffer.alloc(0))]);
}

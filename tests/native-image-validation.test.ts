import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeImage} from '../server/native-image-validation.js';
import {pixelPng} from './helpers/pixel.js';

test('native image validation decodes owned PNG and rejects damaged content or MIME without changing bytes',async()=>{
  const bytes=pixelPng();const original=Buffer.from(bytes);await validateNativeImage(bytes.toString('base64'),'image/png');assert.deepEqual(bytes,original);
  await assert.rejects(validateNativeImage(bytes.toString('base64'),'image/jpeg'),{status:422});
  await assert.rejects(validateNativeImage('%%%%','image/png'),{status:422});
  const broken=Buffer.from(bytes);broken[45]^=255;await assert.rejects(validateNativeImage(broken.toString('base64'),'image/png'),{status:422});
  await assert.rejects(validateNativeImage(bytes.subarray(0,24).toString('base64'),'image/png'),{status:422});
});
test('oversized declared surfaces are rejected before attempting decode',async()=>{
  const png=pixelPng();png.writeUInt32BE(100000,16);png.writeUInt32BE(100000,20);await assert.rejects(validateNativeImage(png.toString('base64'),'image/png'),{status:413});
  const gif=Buffer.alloc(10);gif.write('GIF89a');gif.writeUInt16LE(65535,6);gif.writeUInt16LE(65535,8);await assert.rejects(validateNativeImage(gif.toString('base64'),'image/gif'),{status:413});
  const webp=Buffer.alloc(30);webp.write('RIFF');webp.writeUInt32LE(22,4);webp.write('WEBP',8);webp.write('VP8X',12);webp.writeUInt32LE(10,16);webp.fill(255,24);await assert.rejects(validateNativeImage(webp.toString('base64'),'image/webp'),{status:413});
  const jpeg=Buffer.from([255,216,255,192,0,8,8,255,255,255,255,1]);await assert.rejects(validateNativeImage(jpeg.toString('base64'),'image/jpeg'),{status:413});
});
test('later GIF frames and WebP inner frame dimensions cannot bypass the canvas bound',async()=>{
  const header=Buffer.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,0,0]);
  const frame=Buffer.from([44,0,0,0,0,1,0,1,0,0,2,2,68,1,0]);const huge=Buffer.from(frame);huge.writeUInt16LE(65535,5);huge.writeUInt16LE(65535,7);
  await assert.rejects(validateNativeImage(Buffer.concat([header,frame,huge,Buffer.from([59])]).toString('base64'),'image/gif'),{status:413});
  const chunk=(name:string,data:Buffer)=>{const h=Buffer.alloc(8);h.write(name);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,Buffer.alloc(data.length&1)]);};
  const canvas=chunk('VP8X',Buffer.alloc(10));const frameHeader=Buffer.alloc(16);const coded=Buffer.alloc(10);coded.set([157,1,42],3);coded.writeUInt16LE(16383,6);coded.writeUInt16LE(16383,8);
  const body=Buffer.concat([Buffer.from('WEBP'),canvas,chunk('ANMF',Buffer.concat([frameHeader,chunk('VP8 ',coded)]))]);const riff=Buffer.alloc(8);riff.write('RIFF');riff.writeUInt32LE(body.length,4);
  await assert.rejects(validateNativeImage(Buffer.concat([riff,body]).toString('base64'),'image/webp'),{status:413});
  const malformed=Buffer.concat([riff,body]);malformed.writeUInt32LE(0xffffffff,16);await assert.rejects(validateNativeImage(malformed.toString('base64'),'image/webp'),{status:422});
  const jpeg=Buffer.from([255,216,255,192,0,8,8,0,1,0,1,1,255,218,0,2,0,255,0,0,255,192,0,8,8,255,255,255,255,1,255,217]);
  await assert.rejects(validateNativeImage(jpeg.toString('base64'),'image/jpeg'),{status:413});
});
test('progressive JPEG and animated WebP decode with the fixed Pi decoder',async()=>{
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAADAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAAEBv/aAAwDAQACEAMQAAABjg1r/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABDz/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=','base64');
  const webp=Buffer.from('UklGRtYAAABXRUJQVlA4WAoAAAASAAAAAwAAAgAAQU5JTQYAAAAAAAAAAABBTk1GSgAAAAAAAAAAAAMAAAIAAGQAAAJWUDggMgAAADABAJ0BKgQAAwABQCYloAADcAD+8ut///mwP/bz/wR6Af//0uD//pcH//S4P/SkAAAAQU5NRlgAAAAAAAAAAAADAAACAABkAAACQUxQSAoAAAABB1DAiAhERP8DVlA4IC4AAAAwAQCdASoEAAMAAUAmJaAAA3AA/vtV4///S4P/+lwf/9Lg/9Lg//rV5Vesq6AA','base64');
  assert(jpeg.includes(Buffer.from([255,194])),'progressive JPEG uses SOF2');
  assert(webp.includes(Buffer.from('ANMF')),'animated WebP contains a frame');
  const jpegOriginal=Buffer.from(jpeg),webpOriginal=Buffer.from(webp);
  await validateNativeImage(jpeg.toString('base64'),'image/jpeg');
  await validateNativeImage(webp.toString('base64'),'image/webp');
  assert.deepEqual(jpeg,jpegOriginal);assert.deepEqual(webp,webpOriginal);
});

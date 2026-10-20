import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
import {validateNativeImage} from '../server/native-image-validation.js';

const output='output/dev-evidence/pi-parity/image-formats';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
try{
  const page=await browser.newPage();const samples=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=3;canvas.height=2;const context=canvas.getContext('2d')!;
    context.fillStyle='#e02040';context.fillRect(0,0,3,2);
    const jpeg=canvas.toDataURL('image/jpeg',0.9),webp=canvas.toDataURL('image/webp',0.9);
    context.clearRect(0,0,1,1);const alpha=canvas.toDataURL('image/webp',0.9);
    return [{name:'rgb.jpg',mime:'image/jpeg',url:jpeg},{name:'rgb.webp',mime:'image/webp',url:webp},{name:'alpha.webp',mime:'image/webp',url:alpha}];
  });
  const gifHeader=Buffer.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,0,0]);
  const gifFrame=Buffer.from([44,0,0,0,0,1,0,1,0,0,2,2,68,1,0]);
  for(const frames of [1,2]){const bytes=Buffer.concat([gifHeader,...Array.from({length:frames},()=>gifFrame),Buffer.from([59])]);samples.push({name:`frames-${frames}.gif`,mime:'image/gif',url:'data:image/gif;base64,'+bytes.toString('base64')});}
  for(const sample of samples){assert(sample.url.startsWith(`data:${sample.mime};base64,`));const data=sample.url.split(',')[1];writeFileSync(join(output,sample.name),Buffer.from(data,'base64'));await validateNativeImage(data,sample.mime);console.log(`PASS ${sample.name}: actual decode, original dimensions retained`);}
}finally{await browser.close();}

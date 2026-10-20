import {resizeImage} from '@earendil-works/pi-coding-agent';
import {AppError} from './store.js';
import {nativeSessionMaximum} from './native-inspection.js';

const invalid=()=>new AppError(422,'历史图片编码、格式或内容损坏');
function surface(width:number,height:number){
  if(!width||!height)throw invalid();
  if(width*height*4>nativeSessionMaximum)throw new AppError(413,'历史图片声明的RGBA像素缓冲超过128 MiB，请先缩小图片');
}
function gifDimensions(bytes:Buffer):[number,number]{
  const width=bytes.readUInt16LE(6),height=bytes.readUInt16LE(8);surface(width,height);
  if(bytes.length<13)throw invalid();let offset=13+((bytes[10]&128)?3*(2**((bytes[10]&7)+1)):0);
  const blocks=()=>{for(;;){if(offset>=bytes.length)throw invalid();const size=bytes[offset++];if(!size)return;if(offset+size>bytes.length)throw invalid();offset+=size;}};
  while(offset<bytes.length){const marker=bytes[offset++];
    if(marker===59)return [width,height];
    if(marker===33){if(offset>=bytes.length)throw invalid();offset++;blocks();continue;}
    if(marker!==44||offset+9>bytes.length)throw invalid();
    surface(bytes.readUInt16LE(offset+4),bytes.readUInt16LE(offset+6));const packed=bytes[offset+8];offset+=9;
    if(packed&128)offset+=3*(2**((packed&7)+1));if(offset>=bytes.length)throw invalid();offset++;blocks();
  }
  throw invalid();
}
function webpDimensions(bytes:Buffer):[number,number]{
  let canvas:[number,number]|undefined;let coded:[number,number]|undefined;
  const scan=(start:number,end:number,nested=false)=>{let offset=start;
    while(offset+8<=end){const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),data=offset+8;const next=data+size+(size&1);if(next>end)throw invalid();let dims:[number,number]|undefined;
      if(type==='VP8X'){if(nested||size<10)throw invalid();dims=[1+bytes.readUIntLE(data+4,3),1+bytes.readUIntLE(data+7,3)];canvas=dims;}
      if(type==='VP8 '){if(size<10||bytes[data+3]!==157||bytes[data+4]!==1||bytes[data+5]!==42)throw invalid();dims=[bytes.readUInt16LE(data+6)&16383,bytes.readUInt16LE(data+8)&16383];if(!nested)coded=dims;}
      if(type==='VP8L'){if(size<5||bytes[data]!==47)throw invalid();dims=[1+((bytes[data+1]|bytes[data+2]<<8)&16383),1+(((bytes[data+2]>>6)|(bytes[data+3]<<2)|(bytes[data+4]<<10))&16383)];if(!nested)coded=dims;}
      if(type==='ANMF'){if(nested||size<16)throw invalid();dims=[1+bytes.readUIntLE(data+6,3),1+bytes.readUIntLE(data+9,3)];surface(...dims);scan(data+16,data+size,true);}
      if(dims)surface(...dims);offset=next;
    }if(offset!==end)throw invalid();
  };
  const end=bytes.readUInt32LE(4)+8;if(end!==bytes.length)throw invalid();scan(12,end);if(!canvas&&!coded)throw invalid();return canvas??coded!;
}
function dimensions(bytes:Buffer,mime:string):[number,number]{
  if(mime==='image/png'&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
  if(mime==='image/gif'&&bytes.length>=10&&['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))return gifDimensions(bytes);
  if(mime==='image/jpeg'&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    let offset=2;let entropy=false;let found:[number,number]|undefined;
    while(offset<bytes.length){
      if(entropy){const next=bytes.indexOf(255,offset);if(next<0)break;offset=next;}
      if(bytes[offset++]!==255)throw invalid();while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===217){if(found)return found;throw invalid();}if((entropy&&marker===0)||marker===1||(marker>=208&&marker<=215))continue;
      if(offset+2>bytes.length)throw invalid();const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)throw invalid();
      if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){if(length<8)throw invalid();const dims:[number,number]=[bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];surface(...dims);if(found&&(found[0]!==dims[0]||found[1]!==dims[1]))throw invalid();found=dims;}
      entropy=marker===218;offset+=length;
    }
  }
  if(mime==='image/webp'&&bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
    return webpDimensions(bytes);
  }
  throw invalid();
}
/** Validate without changing original encoded pixels. Decode only in owned workers. */
export async function validateNativeImage(data:unknown,mime:unknown){
  if(typeof data!=='string'||typeof mime!=='string'||!data.length||data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw invalid();
  const bytes=Buffer.from(data,'base64');if(bytes.toString('base64')!==data)throw invalid();
  const [width,height]=dimensions(bytes,mime);
  // Bound a single decoded RGBA surface by the existing 128 MiB session budget.
  surface(width,height);
  let decoded;try{decoded=await resizeImage(bytes,mime,{maxWidth:width,maxHeight:height,maxBytes:data.length+4});}catch{throw invalid();}
  if(!decoded||decoded.originalWidth!==width||decoded.originalHeight!==height)throw invalid();
}

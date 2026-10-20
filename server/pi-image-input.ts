import {createHash} from 'node:crypto';
type Image={type:'image';data:string;mimeType:string};
const key=(image:Image)=>image.mimeType+':'+createHash('sha256').update(image.data).digest('hex');

/** Consult only the effective in-memory context, never pruned disk ancestors. */
export function imagesForPrompt(images:Image[],messages:readonly {role:string;content?:unknown}[],retry:boolean):Image[]{
  if(!retry||!images.length)return images;
  const existing=new Set<string>();
  for(const message of messages){
    if(message.role!=='user'||!Array.isArray(message.content))continue;
    for(const part of message.content){
      if(part?.type==='image'&&typeof part.data==='string'&&typeof part.mimeType==='string')existing.add(key(part));
    }
  }
  return images.filter(image=>!existing.has(key(image)));
}

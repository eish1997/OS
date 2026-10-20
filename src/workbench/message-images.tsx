import React,{useState} from 'react';
import type {ConversationMessage} from '../../shared/contracts';
function MessageImage({image}:{image:NonNullable<ConversationMessage['images']>[number]}){
  const [failed,setFailed]=useState(false);
  return <figure className="wb-message-image">{image.url&&!failed?<img src={image.url} alt={`附带图片：${image.name}`} loading="lazy" onError={()=>setFailed(true)}/>:<p>图片暂时无法读取</p>}<figcaption>{image.url?<a href={image.url} download={image.name}>{image.name} · 下载原图</a>:image.name}</figcaption></figure>;
}
export function MessageImages({images}:Pick<ConversationMessage,'images'>){
  if(!images?.length)return null;
  return <div className="wb-message-images" aria-label="本次消息附带的原图">{images.map(image=><MessageImage key={image.assetId} image={image}/>)}</div>;
}

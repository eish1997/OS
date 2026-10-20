import {join} from 'node:path';
import {detectSupportedImageMimeTypeFromFile,resizeImage} from '@earendil-works/pi-coding-agent';
import type {Asset} from '../shared/contracts.js';
import {AppError,type Store} from './store.js';
import type {Assets} from './assets.js';

/** Uses immutable asset versions; derived image bytes live in native session history. */
export async function imageAttachments(store:Store,assets:Assets,projectId:string,ids:string[],supportsImages:boolean){
  const sources:Asset[]=[];
  let total=0;
  for(const id of [...new Set(ids)]){
    const asset=store.get<Asset>('asset',id);
    if(asset.projectId!==projectId)throw new AppError(403,'图片或资料不属于当前项目');
    if(asset.status!=='ready')throw new AppError(410,'输入资产已删除');
    if(!asset.mime.toLowerCase().startsWith('image/'))continue;
    total+=asset.size;sources.push(asset);
  }
  if(sources.length>4||total>20*1024*1024)throw new AppError(413,'每次最多附加4张图片，原图合计不超过20 MB');
  if(sources.length&&!supportsImages)throw new AppError(400,'当前模型不支持图片，请选择支持视觉的模型或移除图片');
  const images:{type:'image';data:string;mimeType:string}[]=[];
  const provenance:{assetId:string;hash:string;mimeType:string;width:number;height:number;originalWidth:number;originalHeight:number}[]=[];
  for(const asset of sources){
    // Validate locator, content hash and actual format, not the uploaded MIME label.
    assets.read(asset);
    const mime=await detectSupportedImageMimeTypeFromFile(join(assets.dir,asset.locator));
    if(!mime||!['image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw new AppError(400,'图片内容格式不支持，请使用PNG、JPEG、GIF或WebP');
    const data=assets.read(asset);
    const result=await resizeImage(data,mime);
    if(!result)throw new AppError(400,'图片损坏或无法转换为模型可接收的大小');
    images.push({type:'image',data:result.data,mimeType:result.mimeType});
    provenance.push({assetId:asset.id,hash:asset.hash,mimeType:result.mimeType,width:result.width,height:result.height,originalWidth:result.originalWidth,originalHeight:result.originalHeight});
  }
  return {images,provenance};
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { CanvasBindings } from './canvas-bindings.js';
import { CanvasTransport } from './canvas-transport.js';
import { AppError } from './store.js';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const reply=(res:ServerResponse,data:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(data));};
async function raw(req:IncomingMessage,limit:number){
  const parts:Buffer[]=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw new AppError(413,'画板请求内容过大');parts.push(chunk);}
  return Buffer.concat(parts);
}
async function body(req:IncomingMessage,limit:number){
  try{const value:unknown=JSON.parse((await raw(req,limit)).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value as Record<string,unknown>;}
  catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'画板请求格式无效');}
}
function checked(result:{status:number;data:any}){
  if(result.status<200||result.status>=300)throw new AppError(result.status,result.data?.message??'画板操作未完成');
  return result.data;
}
/** Every request carries its own scope; no process-global selected project. */
export class CanvasApi {
  private readonly previews=new Map<string,{projectId:string|null;path:string;expires:number}>();
  private readonly directoryIntents=new Map<string,{projectId:string|null;mountId:string;assetId?:string;childCanvasId?:string;expires:number}>();
  constructor(readonly bindings:CanvasBindings){}
  project(req:IncomingMessage){
    const header=req.headers['x-canvas-project'];
    if(header===undefined||header==='personal')return null;
    if(typeof header!=='string'||!uuid.test(header))throw new AppError(400,'画板项目上下文无效');
    return header;
  }
  async handle(req:IncomingMessage,res:ServerResponse,path:string,transport:CanvasTransport,origin:string){
    const projectId=this.project(req);this.bindings.scope(projectId);
    const url=new URL(path,'http://canvas.invalid'),parts=url.pathname.split('/').filter(Boolean);
    const packageUpload=req.method==='POST'&&parts[0]==='package-imports'&&parts.length===2&&uuid.test(parts[1]);
    if(req.method!=='GET'){
      if(req.headers.origin!==origin)throw new AppError(403,'画板写入来源不被允许');
      const type=req.headers['content-type']?.split(';')[0];
      if(type!==(packageUpload?'application/octet-stream':'application/json'))throw new AppError(415,'画板请求格式不支持');
    }
    if(/[%\\]/.test(path)||[...url.searchParams.keys()].some(key=>key!=='revision')||(url.search&&!/^\?revision=[1-9][0-9]*$/.test(url.search)))throw new AppError(404,'画板接口不存在');
    if(path==='/context'&&req.method==='GET'){
      const recent=this.bindings.recent(projectId);
      return reply(res,{projectId,canvasId:recent?.canvasId??randomUUID(),draft:!recent,revision:recent?.revision??0});
    }
    if(path==='/context/opened'&&req.method==='POST'){
      const data=await body(req,4096);
      if(typeof data.canvasId!=='string')throw new AppError(400,'画板身份无效');
      this.bindings.opened(projectId,data.canvasId);return reply(res,{saved:true});
    }
    if(path==='/unbound'&&req.method==='GET'){
      const rows=checked(await transport.json('/canvases'));if(!Array.isArray(rows))throw new AppError(502,'画板列表无效');
      return reply(res,rows.filter(row=>typeof row.canvasId==='string'&&uuid.test(row.canvasId)&&!this.bindings.find(row.canvasId)));
    }
    if(path==='/associate'&&req.method==='POST'){
      const data=await body(req,4096);
      if(typeof data.canvasId!=='string'||!uuid.test(data.canvasId)||typeof data.operationId!=='string'||!uuid.test(data.operationId))throw new AppError(400,'关联操作身份无效');
      const document=checked(await transport.json(`/canvases/${data.canvasId}`));
      return reply(res,this.bindings.associate(projectId,data.canvasId,data.operationId,document.revision));
    }
    if(path==='/canvases'&&req.method==='GET'){
      const rows=checked(await transport.json('/canvases'));
      if(!Array.isArray(rows))throw new AppError(502,'画板列表无效');
      for(const binding of this.bindings.list(projectId))if(binding.state==='prepared')await this.reconcile(projectId,binding.canvasId,transport);
      const allowed=new Set(this.bindings.list(projectId).filter(row=>row.state==='ready').map(row=>row.canvasId));
      return reply(res,rows.filter(row=>allowed.has(row.canvasId)));
    }
    if(parts[0]==='canvases'&&parts[1]&&uuid.test(parts[1])){
      const canvasId=parts[1];
      if(parts.length===2&&req.method==='POST'){
        const data=await body(req,transport.bodyLimit);
        if(typeof data.operationId!=='string'||!uuid.test(data.operationId))throw new AppError(400,'画板写入操作身份无效');
        let binding=this.bindings.find(canvasId);
        if(!binding){
          if(data.expectedRevision!==0)throw new AppError(403,'画板未关联当前项目');
          const existing=await transport.json(`/canvases/${canvasId}`);
          if(existing.status!==404){checked(existing);throw new AppError(409,'已有画板须显式关联，不能自动占用');}
          binding=this.bindings.prepare(projectId,canvasId,data.operationId);
        }else{
          this.bindings.authorize(projectId,canvasId,true);
          if(binding.state==='prepared')binding=this.bindings.adoptReservation(projectId,canvasId,data.operationId);
        }
        const saved=checked(await transport.json(`/canvases/${canvasId}`,'POST',JSON.stringify(data)));
        if(saved.canvasId!==canvasId||!Number.isSafeInteger(saved.revision)||saved.revision<1)throw new AppError(502,'画板保存确认无效');
        this.bindings.confirm(projectId,canvasId,binding.operationId,saved.revision);
        this.bindings.opened(projectId,canvasId);
        return reply(res,saved);
      }
      this.bindings.authorize(projectId,canvasId,true);
      await this.reconcile(projectId,canvasId,transport);
      this.bindings.authorize(projectId,canvasId);
      return transport.forward(req,res,path,origin);
    }
    if(parts[0]==='operations'&&parts.length===2&&req.method==='GET'){
      const result=checked(await transport.json(path));this.bindings.authorize(projectId,result.canvasId);return reply(res,result);
    }
    if(path==='/mounts'&&req.method==='GET'){
      const rows=await this.scopedRows(projectId,transport,path,true);
      return reply(res,rows);
    }
    if(path==='/package-imports'&&req.method==='GET'){
      const rows=await this.scopedRows(projectId,transport,path,true);
      return reply(res,rows);
    }
    if(packageUpload)return this.preparePackage(projectId,parts[1],req,res,transport);
    if(path==='/mounts'&&req.method==='POST'){
      const data=await body(req,65536);
      if(typeof data.path!=='string'||data.path.length>1024)throw new AppError(400,'目录路径无效');
      const mount=checked(await transport.json('/mounts','POST',JSON.stringify({path:data.path})));
      if(typeof mount.id!=='string'||!uuid.test(mount.id)||typeof mount.canvasId!=='string'||!uuid.test(mount.canvasId))throw new AppError(502,'目录登记结果无效');
      this.bindings.reserve(projectId,mount.canvasId);
      return reply(res,mount);
    }
    if(parts[0]==='mounts'&&parts[1]&&uuid.test(parts[1])&&parts.length===5&&parts[2]==='files'&&parts[4]==='open'&&req.method==='POST'){
      await this.authorizeMount(projectId,parts[1],transport);
      const preview=checked(await transport.json(url.pathname.replace(/\/open$/,'/open-preview'),'POST','{}'));
      const expected=preview.canvasId??null;
      if(expected!==null&&(typeof expected!=='string'||!uuid.test(expected)))throw new AppError(502,'子目录身份无效');
      if(expected){
        const owner=this.bindings.find(expected);
        if(owner&&owner.projectId!==projectId)throw new AppError(403,'子目录属于其他项目');
        if(!owner)this.bindings.reserve(projectId,expected);
      }
      const opened=checked(await transport.json(url.pathname,'POST',JSON.stringify({expectedCanvasId:expected})));
      if(typeof opened.canvasId!=='string'||!uuid.test(opened.canvasId)||(expected&&opened.canvasId!==expected))throw new AppError(502,'子目录登记结果无效');
      this.bindings.reserve(projectId,opened.canvasId);
      return reply(res,opened);
    }
    if(parts[0]==='mounts'&&parts[1]&&uuid.test(parts[1])&&parts.length===3&&req.method==='POST'&&parts[2]==='relink-preview')return this.relinkPreview(projectId,parts[1],req,res,transport);
    if(parts[0]==='mounts'&&parts[1]&&uuid.test(parts[1])&&parts.length===3&&req.method==='POST'&&parts[2]==='relink-confirm')return this.relinkConfirm(projectId,parts[1],req,res,transport);
    if(parts[0]==='mounts'&&parts[1]&&uuid.test(parts[1])&&parts.length===5&&parts[2]==='files'&&uuid.test(parts[3])&&req.method==='POST'&&parts[4]==='replacement-preview')return this.replacementPreview(projectId,parts[1],parts[3],res,transport);
    if(parts[0]==='mounts'&&parts[1]&&uuid.test(parts[1])&&parts.length===5&&parts[2]==='files'&&uuid.test(parts[3])&&req.method==='POST'&&parts[4]==='replacement-confirm')return this.replacementConfirm(projectId,parts[1],parts[3],req,res,transport);
    if(parts[0]==='mounts'&&parts[1]&&uuid.test(parts[1])){
      await this.authorizeMount(projectId,parts[1],transport);
      return transport.forward(req,res,path,origin);
    }
    if(parts[0]==='file-targets'&&req.method==='POST'&&parts[1]==='preview')return this.previewTarget(projectId,req,res,transport);
    if(parts[0]==='file-targets'&&req.method==='POST'&&parts[1]==='confirm')return this.confirmTarget(projectId,req,res,transport);
    if(path==='/outputs'&&req.method==='POST'){
      const data=await body(req,transport.bodyLimit);
      if(typeof data.canvasId!=='string'||typeof data.mountId!=='string')throw new AppError(400,'输出归属无效');
      this.bindings.authorize(projectId,data.canvasId);
      await this.authorizeMount(projectId,data.mountId,transport);
      return reply(res,checked(await transport.json('/outputs','POST',JSON.stringify(data))));
    }
    if(parts[0]==='outputs'&&parts[1]&&uuid.test(parts[1])&&parts.length===3&&req.method==='POST'&&['commit','cancel','replace'].includes(parts[2])){
      const meta=await transport.json(`/outputs/${parts[1]}`);
      if(meta.status===404)throw new AppError(404,'输出操作不存在');
      const output=checked(meta);
      this.bindings.authorize(projectId,output.canvasId);
      const payload=parts[2]==='replace'?await body(req,65536):{};
      return reply(res,checked(await transport.json(path,'POST',JSON.stringify(payload))));
    }
    if(parts[0]==='package-imports'&&parts[1]&&uuid.test(parts[1])&&parts[2]==='resume'&&parts.length===3&&req.method==='POST'){
      const rows=await this.scopedRows(projectId,transport,'/package-imports',true);
      const importing=rows.find(row=>row.operationId===parts[1]);
      if(!importing)throw new AppError(403,'作品包导入未关联当前项目');
      const result=checked(await transport.json(url.pathname,'POST',JSON.stringify(await body(req,65536))));
      if(result.canvasId!==importing.canvasId||!Number.isSafeInteger(result.revision)||result.revision<1)throw new AppError(502,'作品包恢复结果无效');
      const binding=this.bindings.find(String(result.canvasId));
      if(binding?.state==='prepared'){
        const adopted=this.bindings.adoptReservation(projectId,String(result.canvasId),parts[1]);
        this.bindings.confirm(projectId,String(result.canvasId),adopted.operationId,result.revision);
      }
      return reply(res,result);
    }
    if(path==='/layout'||path==='/health')return transport.forward(req,res,path,origin);
    // Subresources are opened only once their reverse ownership check exists.
    throw new AppError(403,'该画板资源尚未关联当前项目');
  }
  private async scopedRows(projectId:string|null,transport:CanvasTransport,path:string,includePrepared:boolean){
    const rows=checked(await transport.json(path));
    const allowed=new Set(this.bindings.list(projectId).filter(row=>includePrepared||row.state==='ready').map(row=>row.canvasId));
    if(!Array.isArray(rows))throw new AppError(502,'画板资源列表无效');
    return rows.filter(row=>typeof row.canvasId==='string'&&allowed.has(row.canvasId));
  }
  private async authorizeMount(projectId:string|null,mountId:string,transport:CanvasTransport){
    if(!uuid.test(mountId))throw new AppError(400,'目录身份无效');
    const rows=await this.scopedRows(projectId,transport,'/mounts',true);
    const mount=rows.find(row=>row.id===mountId);
    if(!mount)throw new AppError(403,'目录未关联当前项目');
    this.bindings.authorize(projectId,String(mount.canvasId),true);
    return mount;
  }
  private async preparePackage(projectId:string|null,operationId:string,req:IncomingMessage,res:ServerResponse,transport:CanvasTransport){
    const bytes=await raw(req,transport.bodyLimit);
    const decoded=await import('../apps/canvas/local/canvas-package.mjs').then(module=>module.decodeCanvasPackage(bytes)).catch((error:unknown)=>{const message=error instanceof Error?error.message:'';throw new AppError(400,message&&!/[/\\]/.test(message)?message:'作品包无法读取');});
    const manifest=decoded.manifest as {canvasId?:unknown;references?:{mounts?:Array<{canvasId?:unknown}>}};
    if(typeof manifest.canvasId!=='string'||!uuid.test(manifest.canvasId))throw new AppError(400,'作品包画板身份无效');
    const canvasIds=[manifest.canvasId,...(manifest.references?.mounts??[]).map(mount=>mount.canvasId)];
    for(const canvasId of canvasIds){
      if(typeof canvasId!=='string'||!uuid.test(canvasId))throw new AppError(400,'作品包引用身份无效');
      const binding=this.bindings.find(canvasId);
      if(binding&&binding.projectId!==projectId)throw new AppError(403,'画板属于其他项目');
    }
    const existing=await transport.json(`/canvases/${manifest.canvasId}`);
    if(existing.status!==404){checked(existing);throw new AppError(409,'已有画板须显式关联，不能通过作品包占用');}
    for(const canvasId of new Set(canvasIds))this.bindings.reserve(projectId,String(canvasId));
    const prepared=checked(await transport.bytes(`/package-imports/${operationId}`,bytes));
    if(prepared.canvasId!==manifest.canvasId||prepared.operationId!==operationId)throw new AppError(502,'作品包登记身份不一致');
    return reply(res,prepared);
  }
  private async previewTarget(projectId:string|null,req:IncomingMessage,res:ServerResponse,transport:CanvasTransport){
    const data=await body(req,65536);
    if(typeof data.path!=='string'||data.path.length>1024)throw new AppError(400,'文件路径无效');
    const preview=checked(await transport.json('/file-targets/preview','POST',JSON.stringify({path:data.path})));
    if(typeof preview.token!=='string'||!uuid.test(preview.token)||typeof preview.path!=='string')throw new AppError(502,'文件预览结果无效');
    const now=Date.now();
    for(const [token,value] of this.previews)if(value.expires<=now)this.previews.delete(token);
    this.previews.set(preview.token,{projectId,path:preview.path,expires:now+300000});
    return reply(res,preview);
  }
  private async confirmTarget(projectId:string|null,req:IncomingMessage,res:ServerResponse,transport:CanvasTransport){
    const data=await body(req,4096);
    const preview=typeof data.token==='string'?this.previews.get(data.token):undefined;
    if(!preview||preview.expires<=Date.now()||preview.projectId!==projectId)throw new AppError(403,'文件确认未关联当前项目');
    const mounts=checked(await transport.json('/mounts'));
    if(!Array.isArray(mounts))throw new AppError(502,'目录列表无效');
    const parent=dirname(preview.path);
    const existing=mounts.find(mount=>mount?.path===parent);
    if(existing){
      const binding=typeof existing.canvasId==='string'?this.bindings.find(existing.canvasId):undefined;
      if(!binding||binding.projectId!==projectId)throw new AppError(403,'目录属于其他项目');
    }
    const entry=checked(await transport.json('/file-targets/confirm','POST',JSON.stringify({token:data.token})));
    if(typeof entry.mountId!=='string'||!uuid.test(entry.mountId))throw new AppError(502,'文件确认结果无效');
    const refreshed=checked(await transport.json('/mounts'));
    const mount=Array.isArray(refreshed)?refreshed.find(item=>item?.id===entry.mountId):undefined;
    if(typeof mount?.canvasId!=='string'||!uuid.test(mount.canvasId))throw new AppError(502,'文件目录身份无效');
    this.bindings.reserve(projectId,mount.canvasId);
    this.previews.delete(String(data.token));
    return reply(res,entry);
  }
  private rememberIntent(token:string,intent:{projectId:string|null;mountId:string;assetId?:string;childCanvasId?:string}){
    const now=Date.now();
    for(const [key,value] of this.directoryIntents)if(value.expires<=now)this.directoryIntents.delete(key);
    this.directoryIntents.set(token,{...intent,expires:now+300000});
  }
  private claimIntent(projectId:string|null,token:unknown,mountId:string,assetId?:string){
    const intent=typeof token==='string'?this.directoryIntents.get(token):undefined;
    if(!intent||intent.expires<=Date.now()||intent.projectId!==projectId||intent.mountId!==mountId||intent.assetId!==assetId)throw new AppError(403,'目录确认未关联当前项目');
    if(intent.childCanvasId){
      const child=this.bindings.find(intent.childCanvasId);
      if(!child||child.projectId!==projectId)throw new AppError(403,'子目录属于其他项目');
    }
    return intent;
  }
  private async relinkPreview(projectId:string|null,mountId:string,req:IncomingMessage,res:ServerResponse,transport:CanvasTransport){
    const mount=await this.authorizeMount(projectId,mountId,transport);
    const data=await body(req,65536);
    if(typeof data.path!=='string'||data.path.length>1024)throw new AppError(400,'目录路径无效');
    const preview=checked(await transport.json(`/mounts/${mountId}/relink-preview`,'POST',JSON.stringify({path:data.path})));
    if(preview.mountId!==mountId||preview.canvasId!==mount.canvasId||typeof preview.token!=='string'||!uuid.test(preview.token)||typeof preview.path!=='string')throw new AppError(502,'目录预览结果无效');
    const mounts=checked(await transport.json('/mounts'));
    if(!Array.isArray(mounts))throw new AppError(502,'目录列表无效');
    const occupied=mounts.find(item=>item?.id!==mountId&&item?.path===preview.path);
    if(occupied){
      const owner=typeof occupied.canvasId==='string'?this.bindings.find(occupied.canvasId):undefined;
      if(!owner||owner.projectId!==projectId)throw new AppError(403,'目标目录属于其他项目');
    }
    this.rememberIntent(preview.token,{projectId,mountId});
    return reply(res,preview);
  }
  private async relinkConfirm(projectId:string|null,mountId:string,req:IncomingMessage,res:ServerResponse,transport:CanvasTransport){
    await this.authorizeMount(projectId,mountId,transport);
    const data=await body(req,4096);
    this.claimIntent(projectId,data.token,mountId);
    const linked=checked(await transport.json(`/mounts/${mountId}/relink-confirm`,'POST',JSON.stringify({token:data.token})));
    this.directoryIntents.delete(String(data.token));
    return reply(res,linked);
  }
  private async replacementPreview(projectId:string|null,mountId:string,assetId:string,res:ServerResponse,transport:CanvasTransport){
    await this.authorizeMount(projectId,mountId,transport);
    const preview=checked(await transport.json(`/mounts/${mountId}/files/${assetId}/replacement-preview`,'POST','{}'));
    if(preview.mountId!==mountId||preview.assetId!==assetId||typeof preview.token!=='string'||!uuid.test(preview.token))throw new AppError(502,'替换预览结果无效');
    let childCanvasId:string|undefined;
    if(preview.childCanvasId!==undefined){
      if(typeof preview.childCanvasId!=='string'||!uuid.test(preview.childCanvasId))throw new AppError(502,'子目录身份无效');
      const child=this.bindings.find(preview.childCanvasId);
      if(child&&child.projectId!==projectId)throw new AppError(403,'子目录属于其他项目');
      if(!child)this.bindings.reserve(projectId,preview.childCanvasId);
      childCanvasId=preview.childCanvasId;
    }
    this.rememberIntent(preview.token,{projectId,mountId,assetId,childCanvasId});
    return reply(res,preview);
  }
  private async replacementConfirm(projectId:string|null,mountId:string,assetId:string,req:IncomingMessage,res:ServerResponse,transport:CanvasTransport){
    await this.authorizeMount(projectId,mountId,transport);
    const data=await body(req,4096);
    this.claimIntent(projectId,data.token,mountId,assetId);
    const replaced=checked(await transport.json(`/mounts/${mountId}/files/${assetId}/replacement-confirm`,'POST',JSON.stringify({token:data.token})));
    this.directoryIntents.delete(String(data.token));
    return reply(res,replaced);
  }
  private async reconcile(projectId:string|null,canvasId:string,transport:CanvasTransport){
    const binding=this.bindings.authorize(projectId,canvasId,true);
    if(binding.state==='ready')return;
    const result=await transport.json(`/operations/${binding.operationId}`);
    if(result.status===404)return;
    const operation=checked(result);
    if(operation.canvasId!==canvasId)throw new AppError(409,'画板创建操作身份不一致');
    this.bindings.confirm(projectId,canvasId,binding.operationId,operation.revision);
  }
}

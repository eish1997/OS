import {mkdirSync,existsSync,openSync,closeSync,readSync,writeSync,fsyncSync,lstatSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {Entity,Run} from '../shared/contracts.js';
import {Store,AppError} from './store.js';
import {nativeFingerprint,nativeSessionMaximum} from './native-inspection.js';
import {prepareNativeImport} from './native-import-async.js';
import {branchPoints} from './native-branch-points.js';
import {StorageCapacity} from './storage.js';

export interface NativeImport extends Entity {projectId:string;name:string;bytes:number;sha256:string;revoked?:boolean}
/** The owned file is the durable upload offset; no whole-file host buffering. */
export class NativeImports {
  private gate:StorageCapacity;
  constructor(private store:Store,private root:string,private writeHook?:(stage:'before-write'|'during-write'|'after-sync')=>void){this.gate=new StorageCapacity(root,{},0,'.native-import-write.lock');}
  begin(projectId:string,name:string,bytes:number,sha256:string,commandId:string){
    this.store.get('project',projectId);
    if(!name||name.length>180||/[\x00-\x1f\\/]/.test(name)||!name.endsWith('.jsonl'))throw new AppError(400,'请选择原生JSONL会话文件');
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>nativeSessionMaximum)throw new AppError(413,'原生会话须为1字节至128 MiB');
    if(!/^[a-f0-9]{64}$/.test(sha256)||!commandId||commandId.length>120)throw new AppError(400,'导入校验值或命令ID无效');
    return this.gate.exclusive(()=>this.store.command('native-import:v1:'+commandId,createHash('sha256').update(JSON.stringify({projectId,name,bytes,sha256})).digest('hex'),()=>this.store.create<NativeImport>('native_import',{projectId,name,bytes,sha256})));
  }
  private input(record:NativeImport){return {root:this.root,projectId:record.projectId,path:join(this.root,'sessions',record.projectId,`import-${record.id}.jsonl`)};}
  list(projectId:string){this.store.get('project',projectId);return this.store.list<NativeImport>('native_import',projectId).map(record=>this.get(projectId,record.id));}
  cancel(projectId:string,id:string){
    const action=()=>{
      const record=this.get(projectId,id);
      if(this.store.list<Run>('run',projectId).some(run=>run.importedContinuation?.importId===id))throw new AppError(409,'导入已被恢复任务引用，需保留原件用于追溯与重试');
      // Persist revocation first: a crash before unlink must never permit a late PUT.
      if(!record.revoked)this.store.update<NativeImport>('native_import',id,record.revision,{revoked:true});
      const input=this.input(record);if(existsSync(input.path)){nativeFingerprint({...input,sessionId:''});unlinkSync(input.path);}
      return this.get(projectId,id);
    };
    return this.gate.exclusive(()=>this.store.capacity?this.store.capacity.exclusive(action):action());
  }
  get(projectId:string,id:string){
    const record=this.store.get<NativeImport>('native_import',id);if(record.projectId!==projectId)throw new AppError(403,'导入不属于当前项目');
    const input=this.input(record);const received=existsSync(input.path)?nativeFingerprint({...input,sessionId:''}).bytes:0;
    if(received>record.bytes)throw new AppError(409,'导入文件大小异常，需要核对');
    return {...record,received};
  }
  write(projectId:string,id:string,offset:number,data:Buffer){
    if(!Number.isSafeInteger(offset)||offset<0||!data.length||data.length>1024*1024)throw new AppError(400,'上传块大小或偏移无效');
    const action=()=>{
      const record=this.get(projectId,id);const input=this.input(record);
      if(record.revoked)throw new AppError(410,'导入已撤销，请重新创建');
      if(offset>record.received||offset+data.length>record.bytes)throw new AppError(409,'上传偏移或声明大小不一致');
      if(offset<record.received){
        // A lost acknowledgement or interrupted write can leave an existing prefix.
        const prefix=Math.min(data.length,record.received-offset);const fd=openSync(input.path,'r');const saved=Buffer.alloc(prefix);
        try{if(readSync(fd,saved,0,prefix,offset)!==prefix||!saved.equals(data.subarray(0,prefix)))throw new AppError(409,'已保存的上传内容不一致');}finally{closeSync(fd);}
        if(prefix===data.length)return this.get(projectId,id);
        offset+=prefix;data=data.subarray(prefix);
      }
      this.store.capacity?.assert('sessions',data.length);
      for(const dir of [this.root,join(this.root,'sessions'),join(this.root,'sessions',projectId)])if(existsSync(dir)&&lstatSync(dir).isSymbolicLink())throw new AppError(403,'导入目录不能包含链接');
      mkdirSync(join(this.root,'sessions',projectId),{recursive:true});
      this.writeHook?.('before-write');
      const fd=openSync(input.path,existsSync(input.path)?'r+':'wx',0o600);
      try{
        let written=0;let split=false;
        while(written<data.length){
          const room=data.length-written;
          const slice=this.writeHook&&!split&&room>8?8:room;
          const count=writeSync(fd,data,written,slice,offset+written);if(!count)throw new AppError(507,'导入文件写入中断');written+=count;
          if(this.writeHook&&!split&&written<data.length){split=true;this.writeHook('during-write');}
        }
        fsyncSync(fd);this.writeHook?.('after-sync');
      }finally{closeSync(fd);}
      return this.get(projectId,id);
    };
    return this.gate.exclusive(()=>this.store.capacity?this.store.capacity.exclusive(action):action());
  }
  async preview(projectId:string,id:string,signal?:AbortSignal){
    const record=this.get(projectId,id);if(record.revoked)throw new AppError(410,'导入已撤销');if(record.received!==record.bytes)throw new AppError(409,'原件尚未上传完整');
    const preview=await prepareNativeImport(this.input(record),signal);
    if(preview.sha256!==record.sha256)throw new AppError(422,'原件校验值不一致');
    if(this.get(projectId,id).revoked)throw new AppError(410,'导入已撤销');
    return {...record,preview};
  }
  async points(projectId:string,id:string,offset:number,sourceHash?:string,signal?:AbortSignal){
    const inspected=await this.preview(projectId,id,signal);
    if(sourceHash&&sourceHash!==inspected.preview.sha256)throw new AppError(409,'导入历史已变化');
    const page=await branchPoints({...this.input(inspected),sessionId:inspected.preview.sessionId,offset,limit:30,sourceHash},signal);
    if(this.get(projectId,id).revoked)throw new AppError(410,'导入已撤销');
    return page;
  }
  async checkpoint(projectId:string,id:string,entryId:string,sha256:string,signal?:AbortSignal){
    const initial=nativeFingerprint({...this.input(this.get(projectId,id)),sessionId:''}).fingerprint;
    const record=this.get(projectId,id);if(record.revoked||record.received!==record.bytes)throw new AppError(409,'导入未完成或已撤销');
    const preview=await prepareNativeImport({...this.input(record),entryId},signal);const input={...this.input(record),sessionId:preview.sessionId};
    if(record.sha256!==sha256||preview.sha256!==sha256)throw new AppError(409,'导入原件与选择记录不一致');
    if(this.get(projectId,id).revoked)throw new AppError(410,'导入已撤销');
    if(nativeFingerprint(input).fingerprint!==initial)throw new AppError(409,'导入校验期间原件发生变化');
    return {input,fingerprint:initial,effectiveImageCount:preview.effectiveImageCount!,bytes:preview.bytes,entryCount:preview.entryCount};
  }
}

import type {Entity,Policy,Conversation,Run} from '../shared/contracts.js';
import {Store,AppError} from './store.js';
import {Service,fingerprint,text} from './service.js';
import {NativeImports} from './native-imports.js';
import {nativeFingerprint} from './native-inspection.js';
import {nativeForkGrowth,requireSessionRoom} from './native-session.js';

export interface ImportEnvironment {policy:Policy;pluginSignature:string;mcpSignature:string;plugins:string[];mcpServers:string[];supportsImages:boolean}
interface Confirmation extends Entity {projectId:string;importId:string;sha256:string;entryId:string;environment:ImportEnvironment;expiresAt:number;requiredSessionBytes:number}
export class NativeImportSubmission {
  constructor(private store:Store,private service:Service,private imports:NativeImports,private environment:(projectId:string)=>Promise<ImportEnvironment>){}
  async prepare(projectId:string,importId:string,sha256:string,entryId:string,signal?:AbortSignal,validate=()=>{}){
    text(entryId,'历史节点',120);const checkpoint=await this.imports.checkpoint(projectId,importId,entryId,sha256,signal);
    const environment=await this.environment(projectId);signal?.throwIfAborted();validate();
    if(checkpoint.effectiveImageCount&&!environment.supportsImages)throw new AppError(400,'选定历史的有效上下文含图片，当前模型不支持图片');
    const requiredSessionBytes=nativeForkGrowth(checkpoint);
    return this.store.transaction(()=>{requireSessionRoom(this.store.capacity,requiredSessionBytes);return this.store.create<Confirmation>('native_import_confirmation',{projectId,importId,sha256,entryId,environment,expiresAt:Date.now()+15*60*1000,requiredSessionBytes});});
  }
  async submit(projectId:string,importId:string,data:Record<string,unknown>,signal?:AbortSignal,validate=()=>{}){
    const commandId=text(data.commandId,'命令ID',120),key=`native-import-restore:v1:${commandId}`,digest=fingerprint({projectId,importId,data});
    const receipt=this.store.commandReceipt<{conversation:Conversation;run:Run}>(key,digest);if(receipt){validate();return receipt.value;}
    const confirmation=this.store.get<Confirmation>('native_import_confirmation',text(data.confirmationId,'确认记录',120));
    if(confirmation.projectId!==projectId||confirmation.importId!==importId)throw new AppError(403,'确认记录不属于此导入');
    if(confirmation.expiresAt<Date.now())throw new AppError(409,'环境确认已过期，请重新预览');
    if(data.acceptCurrentEnvironment!==true)throw new AppError(400,'需要确认使用当前环境恢复，原运行环境无法从原件还原');
    const review=text(data.externalEffectsReview,'历史外部操作核对说明',2000),title=text(data.title,'新话题名称',120),goal=text(data.goal,'目标');
    const checkpoint=await this.imports.checkpoint(projectId,importId,confirmation.entryId,confirmation.sha256,signal);
    const current=await this.environment(projectId);signal?.throwIfAborted();validate();
    if(checkpoint.effectiveImageCount&&!current.supportsImages)throw new AppError(400,'选定历史的有效上下文含图片，当前模型不支持图片');
    if(fingerprint(current)!==fingerprint(confirmation.environment))throw new AppError(409,'模型、授权或插件/MCP环境已变化，请重新预览');
    return this.store.command(key,digest,()=>{
      if(confirmation.expiresAt<Date.now())throw new AppError(409,'环境确认已过期，请重新预览');
      if(this.imports.get(projectId,importId).revoked)throw new AppError(410,'导入已撤销');
      if(nativeFingerprint(checkpoint.input).fingerprint!==checkpoint.fingerprint)throw new AppError(409,'导入原件在提交前发生变化');
      requireSessionRoom(this.store.capacity,nativeForkGrowth(checkpoint));
      const importedFrom={importId,sourceHash:confirmation.sha256,sourceEntryId:confirmation.entryId};
      const conversation=this.store.create<Conversation>('conversation',{projectId,title,importedFrom});
      this.store.event('conversation.created',{id:conversation.id},{projectId});
      const submitted=this.service.submit(projectId,goal,`import_${fingerprint({commandId})}`,'pi',current.policy,[],undefined,{view:'project'},null,conversation.id);
      const run=this.store.update<Run>('run',submitted.run.id,submitted.run.revision,{importedContinuation:{importId,sha256:confirmation.sha256,entryId:confirmation.entryId,pluginSignature:current.pluginSignature,mcpSignature:current.mcpSignature,externalEffectsReview:review}});
      this.store.event('conversation.imported',{id:conversation.id,...importedFrom},{projectId,runId:run.id});
      return {conversation,task:submitted.task,run};
    });
  }
}

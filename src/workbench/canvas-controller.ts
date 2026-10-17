import { CanvasBridgeEndpoint, CanvasBridgeError, isCanvasDocumentState, type CanvasContext, type CanvasEnvelope, type CanvasDocumentState } from '../../shared/canvas-bridge';

export const canvasCapabilities=['save-barrier','document-state','interaction','theme','open-context','cancel-switch','project-scope','conflict-recovery'];
export class CanvasController {
  readonly endpoint:CanvasBridgeEndpoint;
  private active:CanvasContext;
  private blocked=false;
  private switching=false;
  constructor(readonly instanceId:string,context:CanvasContext,options:{origin:string;peer:()=>Window|null;
    onState:(state:CanvasDocumentState)=>void;onInteraction:()=>void;onError:(error:unknown)=>void;onContext?:(context:CanvasContext)=>void;timeoutMs?:number}){
    this.active={...context};
    this.endpoint=new CanvasBridgeEndpoint({instanceId,origin:options.origin,peer:options.peer,context:()=>this.active,timeoutMs:options.timeoutMs,
      send:(message,origin)=>{const peer=options.peer();if(!peer)throw new Error('画板窗口已关闭');peer.postMessage(message,origin);},
      onCommand:async message=>{
        if(message.type!=='REQUEST_CONTEXT_OPEN')throw new CanvasBridgeError('unsupported-command','不支持的宿主命令');
        await this.openCanvas(message.payload.canvasId as string,message.payload.draft===true);return {};
      },
      onEvent:message=>{
        if(message.type==='DOCUMENT_STATE')options.onState(message.payload as unknown as CanvasDocumentState);
        if(message.type==='INTERACTION_STARTED')options.onInteraction();
        if(message.type==='REQUEST_OPEN')void this.openCanvas(message.payload.canvasId as string).catch(options.onError);
      }});
    this.onState=options.onState;
    this.onContext=options.onContext;
  }
  private readonly onContext?: (context:CanvasContext)=>void;
  private adopt(context:CanvasContext){this.active=context;this.onContext?.({...context});}
  private readonly onState:(state:CanvasDocumentState)=>void;
  get context(){return {...this.active};}
  private document(result:Record<string,unknown>,canvasId=this.active.canvasId){
    const value=result.document;
    if(!value||typeof value!=='object'||Array.isArray(value))throw new CanvasBridgeError('invalid-state','画板未返回保存状态');
    const {canvasId:actual,...state}=value as Record<string,unknown>;
    if(actual!==canvasId||!isCanvasDocumentState(state))throw new CanvasBridgeError('invalid-state','画板返回的文档身份或状态不一致');
    this.onState(state);return state;
  }
  async initialize(){const result=await this.endpoint.request('INIT',{capabilities:canvasCapabilities});return this.document(result);}
  async save(){return this.document(await this.endpoint.request('SAVE'));}
  async resolveConflict(action:'fork'|'reload'){
    const result=await this.endpoint.request('RESOLVE_CONFLICT',{action});
    const state=this.document(result);
    if(action==='reload')return {state};
    if(typeof result.copyId!=='string'||!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(result.copyId))throw new CanvasBridgeError('invalid-state','副本身份未确认，原画板仍保留');
    return {state,copyId:result.copyId};
  }
  async setInteraction(blocked:boolean){this.blocked=blocked;await this.endpoint.request('SET_INTERACTION',{blocked});}
  async openCanvas(canvasId:string,draft=false){
    return this.openContext(this.active.projectId,canvasId,draft);
  }
  async openContext(projectId:string|null,canvasId:string,draft=false){
    if(this.switching)throw new CanvasBridgeError('switch-in-progress','画板正在切换，请稍后重试');
    if(canvasId===this.active.canvasId&&projectId===this.active.projectId)return;
    this.switching=true;
    const original=this.context,target={projectId,canvasId,contextEpoch:this.active.contextEpoch+1},switchId=crypto.randomUUID();
    try{
      const saved=this.document(await this.endpoint.request('PREPARE_SWITCH',{switchId}));
      if(saved.dirty)throw new CanvasBridgeError('save-unconfirmed','原画板还有未保存内容');
      const result=await this.endpoint.request('OPEN_CONTEXT',{target,switchId,deadline:Date.now()+25000,draft});
      const next=result.context as CanvasContext|undefined;
      if(!next||next.canvasId!==target.canvasId||next.projectId!==target.projectId||next.contextEpoch!==target.contextEpoch)throw new CanvasBridgeError('invalid-context','新画板上下文未确认');
      this.adopt(target);this.document(result,canvasId);
    }catch(error){
      const result=await this.endpoint.request('CANCEL_SWITCH',{switchId});
      const actual=result.context as CanvasContext|undefined;
      const matches=(expected:CanvasContext)=>actual?.contextEpoch===expected.contextEpoch&&actual?.canvasId===expected.canvasId&&actual?.projectId===expected.projectId;
      if(matches(target)){this.adopt(target);this.document(result,canvasId);return;}
      if(!matches(original))throw new CanvasBridgeError('context-unknown','无法确认画板上下文，已停止切换');
      this.document(result,original.canvasId);throw error;
    }finally{
      try{await this.endpoint.request('SET_INTERACTION',{blocked:this.blocked,releaseSwitch:true});}finally{this.switching=false;}
    }
  }
  receive(event:MessageEvent<CanvasEnvelope>){return this.endpoint.receive(event);}
  dispose(){this.endpoint.dispose();}
}

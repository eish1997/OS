/** Browser-only protocol shared by the host and the independently built editor. */
export const CANVAS_PROTOCOL_VERSION = 1;
export const CANVAS_BRIDGE_MAX_BYTES = 64 * 1024;
export const canvasCommands = ['INIT','OPEN_CONTEXT','REQUEST_CONTEXT_OPEN','PREPARE_SWITCH','CANCEL_SWITCH','SAVE','RESOLVE_CONFLICT','THEME','SET_INTERACTION'] as const;
export type CanvasCommand = typeof canvasCommands[number];
export type CanvasDocumentStatus = 'unloaded'|'loading'|'editable'|'dirty'|'saving'|'saved'|'save-failed'|'conflict'|'offline';
export interface CanvasContext { contextEpoch:number; projectId:string|null; canvasId:string|null }
export interface CanvasDocumentState { state:CanvasDocumentStatus; revision:number; dirty:boolean; error?:string }
export interface CanvasTheme { colors:{background:string;surface:string;foreground:string;muted:string;border:string;accent:string};lineWidth:number }
export interface CanvasEnvelope extends CanvasContext {
  protocolVersion:1; instanceId:string; requestId:string; sequence:number;
  type:CanvasCommand|'READY'|'DOCUMENT_STATE'|'INTERACTION_STARTED'|'FOCUS_CHANGED'|'REQUEST_OPEN'|'ACK'|'ERROR';
  payload:Record<string,unknown>;
}
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown)=>typeof value==='string'&&uuid.test(value);
const nullableId=(value:unknown)=>value===null||id(value);
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0;
const keys=(value:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const statuses:CanvasDocumentStatus[]=['unloaded','loading','editable','dirty','saving','saved','save-failed','conflict','offline'];
export function isCanvasDocumentState(value:unknown):value is CanvasDocumentState {
  return record(value)&&keys(value,['state','revision','dirty'],['error'])&&statuses.includes(value.state as CanvasDocumentStatus)&&integer(value.revision)&&typeof value.dirty==='boolean'&&(value.error===undefined||typeof value.error==='string'&&value.error.length<=1024);
}
export function isCanvasEnvelope(value:unknown):value is CanvasEnvelope {
  if(!record(value)||!keys(value,['protocolVersion','instanceId','requestId','sequence','contextEpoch','projectId','canvasId','type','payload'])||
    value.protocolVersion!==CANVAS_PROTOCOL_VERSION||!id(value.instanceId)||!id(value.requestId)||!integer(value.sequence)||value.sequence===0||
    !integer(value.contextEpoch)||!nullableId(value.projectId)||!nullableId(value.canvasId)||!record(value.payload))return false;
  try {if(new TextEncoder().encode(JSON.stringify(value)).length>CANVAS_BRIDGE_MAX_BYTES)return false;}catch{return false;}
  const p=value.payload;
  switch(value.type){
    case 'READY':case 'INIT': return keys(p,['capabilities'])&&Array.isArray(p.capabilities)&&p.capabilities.length<=24&&p.capabilities.every(v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,47}$/.test(v));
    case 'SAVE':return keys(p,[]);
    case 'RESOLVE_CONFLICT':return keys(p,['action'])&&(p.action==='fork'||p.action==='reload');
    case 'PREPARE_SWITCH':return keys(p,[],['switchId'])&&(p.switchId===undefined||id(p.switchId));
    case 'CANCEL_SWITCH':return keys(p,['switchId'])&&id(p.switchId);
    case 'OPEN_CONTEXT':return keys(p,['target'],['switchId','deadline','draft'])&&(p.draft===undefined||typeof p.draft==='boolean')&&(p.switchId===undefined||id(p.switchId))&&(p.deadline===undefined||integer(p.deadline))&&record(p.target)&&keys(p.target,['projectId','canvasId','contextEpoch'])&&nullableId(p.target.projectId)&&nullableId(p.target.canvasId)&&integer(p.target.contextEpoch);
    case 'SET_INTERACTION':return keys(p,['blocked'],['releaseSwitch'])&&typeof p.blocked==='boolean'&&(p.releaseSwitch===undefined||typeof p.releaseSwitch==='boolean');
    case 'THEME':return keys(p,['colors','lineWidth'])&&record(p.colors)&&keys(p.colors,['background','surface','foreground','muted','border','accent'])&&Object.values(p.colors).every(v=>typeof v==='string'&&/^#[\da-f]{6}$/i.test(v))&&typeof p.lineWidth==='number'&&[0.5,1,1.5,2,2.5,3].includes(p.lineWidth);
    case 'DOCUMENT_STATE':return isCanvasDocumentState(p);
    case 'INTERACTION_STARTED':return keys(p,['kind'])&&['pointer','keyboard','wheel'].includes(String(p.kind));
    case 'FOCUS_CHANGED':return keys(p,['focused'])&&typeof p.focused==='boolean';
    case 'REQUEST_OPEN':return keys(p,['canvasId'])&&id(p.canvasId);
    case 'REQUEST_CONTEXT_OPEN':return keys(p,['canvasId'],['draft'])&&id(p.canvasId)&&(p.draft===undefined||typeof p.draft==='boolean');
    case 'ACK':return keys(p,['command','result'])&&canvasCommands.includes(p.command as CanvasCommand)&&record(p.result);
    case 'ERROR':return keys(p,['command','code','message'])&&canvasCommands.includes(p.command as CanvasCommand)&&typeof p.code==='string'&&/^[a-z-]{1,48}$/.test(p.code)&&typeof p.message==='string'&&p.message.length<=1024;
    default:return false;
  }
}

export class CanvasBridgeError extends Error {
  constructor(readonly code:string,message:string){super(message);}
}
const priority=(type:CanvasEnvelope['type'])=>type==='SET_INTERACTION'||type==='CANCEL_SWITCH';
type IncomingEvent={origin:string;source:unknown;data:unknown};
type Pending={message:CanvasEnvelope;resolve:(payload:Record<string,unknown>)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};

/** Explicit peer/source/origin checks; no window-global listener owned by this class.
 * Commands are serial, bounded and deduplicated. Monotonic sequence rejects replay
 * even after a completed response leaves the bounded response cache. */
export class CanvasBridgeEndpoint {
  private sequence=0;
  private incomingCommandSequence=0;
  private eventSequence=0;
  private pending=new Map<string,Pending>();
  private received=new Map<string,{fingerprint:string;response?:CanvasEnvelope}>();
  private commandQueue:Promise<void>=Promise.resolve();
  private queued=0;
  private controls=0;
  private disposed=false;
  constructor(private readonly options:{instanceId:string;origin:string;peer:()=>unknown;context:()=>CanvasContext;
    send:(message:CanvasEnvelope,targetOrigin:string)=>void;onEvent?:(message:CanvasEnvelope)=>void;
    onCommand?:(message:CanvasEnvelope)=>Promise<Record<string,unknown>>|Record<string,unknown>;
    timeoutMs?:number;maxPending?:number}){
    if(!id(options.instanceId)||new URL(options.origin).origin!==options.origin)throw new Error('Invalid canvas bridge identity');
    if(options.timeoutMs!==undefined&&(!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>120000))throw new Error('Invalid canvas bridge timeout');
    if(options.maxPending!==undefined&&(!Number.isSafeInteger(options.maxPending)||options.maxPending<1||options.maxPending>32))throw new Error('Invalid canvas bridge queue limit');
  }
  private envelope(type:CanvasEnvelope['type'],payload:Record<string,unknown>,context=this.options.context(),requestId:string=crypto.randomUUID()):CanvasEnvelope {
    const message:CanvasEnvelope={protocolVersion:1,instanceId:this.options.instanceId,requestId,sequence:++this.sequence,contextEpoch:context.contextEpoch,projectId:context.projectId,canvasId:context.canvasId,type,payload};
    if(!isCanvasEnvelope(message))throw new CanvasBridgeError('invalid-message','Invalid canvas bridge message');
    return message;
  }
  private send(message:CanvasEnvelope){if(!this.disposed)this.options.send(message,this.options.origin);}
  notify(type:Exclude<CanvasEnvelope['type'],CanvasCommand|'ACK'|'ERROR'>,payload:Record<string,unknown>){this.send(this.envelope(type,payload));}
  request(type:CanvasCommand,payload:Record<string,unknown>={}):Promise<Record<string,unknown>> {
    if(this.disposed)return Promise.reject(new CanvasBridgeError('disposed','Canvas bridge is closed'));
    const control=priority(type);
    const pending=[...this.pending.values()].filter(item=>priority(item.message.type)===control).length;
    if(pending>=(control?4:this.options.maxPending??16))return Promise.reject(new CanvasBridgeError('queue-full','Canvas bridge queue is full'));
    const message=this.envelope(type,payload);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(message.requestId);reject(new CanvasBridgeError('timeout','Canvas command was not confirmed'));},this.options.timeoutMs??30000);
      this.pending.set(message.requestId,{message,resolve,reject,timer});
      try{this.send(message);}catch(error){clearTimeout(timer);this.pending.delete(message.requestId);reject(error);}
    });
  }
  private current(message:CanvasEnvelope){const c=this.options.context();return message.contextEpoch===c.contextEpoch&&message.projectId===c.projectId&&message.canvasId===c.canvasId;}
  receive(event:IncomingEvent):boolean {
    if(this.disposed||event.origin!==this.options.origin||!event.source||event.source!==this.options.peer()||!isCanvasEnvelope(event.data)||event.data.instanceId!==this.options.instanceId)return false;
    const message=event.data;
    if(message.type==='ACK'||message.type==='ERROR'){
      const item=this.pending.get(message.requestId);
      if(!item||message.payload.command!==item.message.type||message.contextEpoch!==item.message.contextEpoch||message.projectId!==item.message.projectId||message.canvasId!==item.message.canvasId)return false;
      clearTimeout(item.timer);this.pending.delete(message.requestId);
      if(message.type==='ERROR')item.reject(new CanvasBridgeError(String(message.payload.code),String(message.payload.message)));
      else item.resolve(message.payload.result as Record<string,unknown>);
      return true;
    }
    if(!canvasCommands.includes(message.type as CanvasCommand)){
      if(!this.current(message)||message.sequence<=this.eventSequence)return false;
      this.eventSequence=message.sequence;this.options.onEvent?.(message);return true;
    }
    const fingerprint=JSON.stringify(message),previous=this.received.get(message.requestId);
    if(previous){
      if(previous.fingerprint!==fingerprint)return false;
      if(previous.response)this.send(previous.response);
      return true;
    }
    const fail=(code:string,text:string)=>this.envelope('ERROR',{command:message.type,code,message:text},message,message.requestId);
    if((message.type!=='CANCEL_SWITCH'&&!this.current(message))||message.sequence<=this.incomingCommandSequence){this.send(fail('stale-context','Canvas context or command is stale'));return false;}
    const control=priority(message.type);
    if((control?this.controls:this.queued)>=(control?4:this.options.maxPending??16)){this.send(fail('queue-full','Canvas command queue is full'));return false;}
    this.incomingCommandSequence=message.sequence;
    this.received.set(message.requestId,{fingerprint});if(control)this.controls++;else this.queued++;
    const execute=async()=>{
      if(this.disposed)return;
      let response:CanvasEnvelope;
      try {
        if(message.type!=='CANCEL_SWITCH'&&!this.current(message))throw new CanvasBridgeError('stale-context','Canvas context changed before command execution');
        if(!this.options.onCommand)throw new CanvasBridgeError('unsupported-command','Canvas command is unsupported');
        const result=await this.options.onCommand(message);
        response=this.envelope('ACK',{command:message.type,result},message,message.requestId);
      }catch(error){response=fail(error instanceof CanvasBridgeError?error.code:'command-failed',error instanceof CanvasBridgeError?error.message:'Canvas command failed; document retained');}
      if(this.disposed)return;
      this.received.set(message.requestId,{fingerprint,response});this.send(response);
      while(this.received.size>64){const first=[...this.received].find(([,item])=>item.response);if(!first)break;this.received.delete(first[0]);}
    };
    // Interaction changes affect only the shell. They must not wait for disk or
    // network work, and have their own small budget even when saves fill the queue.
    const work=(control?execute():this.commandQueue.then(execute))
      .catch(()=>{/* Transport failure cannot produce an acknowledged command. */})
      .finally(()=>{if(control)this.controls--;else this.queued--;});
    if(!control)this.commandQueue=work;
    return true;
  }
  dispose(){
    this.disposed=true;
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new CanvasBridgeError('disposed','Canvas bridge was replaced'));}
    this.pending.clear();this.received.clear();
  }
}

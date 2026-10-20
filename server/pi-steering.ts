import type {PiSession} from './pi-adapter.js';
import type {AgentSessionEvent} from '@earendil-works/pi-coding-agent';
import type {RunInput,RunInputState} from '../shared/run-input.js';
import {AsyncLocalStorage} from 'node:async_hooks';
type NativeMessage=Parameters<PiSession['agent']['steer']>[0];

/** Preserve native input preprocessing and queue order; IDs are not model text. */
export class PiSteering {
  private closed=false;private seen=new Set<string>();private pending=new Set<string>();
  private tasks=new Set<Promise<void>>();private failure?:Error;
  private delivery:Promise<void>=Promise.resolve();
  private scope=new AsyncLocalStorage<{active:boolean;messages:NativeMessage[]}>();
  private enqueue:(message:NativeMessage)=>void;
  constructor(private session:PiSession,private report:(id:string,state:RunInputState,reason?:string)=>Promise<unknown>,private fail:()=>void){
    this.enqueue=session.agent.steer.bind(session.agent);
    session.agent.steer=message=>{const scope=this.scope.getStore();if(scope?.active)scope.messages.push(message);else this.enqueue(message);};
    // Extension-generated input is a separate action even when its async work
    // originates in this input handler. Never attach the user's receipt to it.
    const sendUser=session.sendUserMessage.bind(session);const sendCustom=session.sendCustomMessage.bind(session);
    session.sendUserMessage=(...args)=>this.scope.exit(()=>sendUser(...args));
    session.sendCustomMessage=(...args)=>this.scope.exit(()=>sendCustom(...args));
  }
  private track(work:Promise<void>){this.tasks.add(work);void work.catch(error=>{this.failure=error instanceof Error?error:new Error(String(error));this.fail();}).finally(()=>this.tasks.delete(work));}
  receive(input:Pick<RunInput,'id'|'text'>){
    if(this.seen.has(input.id))return;this.seen.add(input.id);
    const delivery=this.delivery.then(async()=>{
      if(this.closed||!this.session.isStreaming){await this.report(input.id,'not_applied','执行尚未就绪或已结束');return;}
      await this.report(input.id,'queued');
      if(this.closed||!this.session.isStreaming){await this.report(input.id,'not_applied','执行在入队确认期间结束');return;}
      // session.steer invokes input handlers and Skill/template expansion before
      // its final core enqueue. Buffer that async scope only, then tag the final
      // user message; plugin-generated queue messages keep their own identity.
      const scope={active:true,messages:[] as NativeMessage[]};let result:'queued'|'handled'|undefined;
      try{result=await this.scope.run(scope,()=>this.session.steer(input.text));}catch{}finally{scope.active=false;}
      if(this.closed||!this.session.isStreaming){this.session.clearQueue();await this.report(input.id,'not_applied','执行在输入处理期间结束，指导未入队');return;}
      if(result==='queued'&&scope.messages.at(-1)?.role==='user'){
        this.pending.add(input.id);
        const last=scope.messages.pop()!;
        for(const message of scope.messages)this.enqueue(message);
        const tagged={...last,workbenchInputId:input.id};this.enqueue(tagged);
      }else{
        for(const message of scope.messages)this.enqueue(message);
        await this.report(input.id,result==='handled'?'handled':'not_applied',result==='handled'?'Pi输入插件已接管处理，不代表目标已完成':'原生输入处理未进入指导队列；可改用排队追问');
      }
    });
    this.delivery=delivery.catch(()=>{});this.track(delivery);
  }
  observe(event:AgentSessionEvent){
    if(event.type!=='message_start'||event.message.role!=='user')return;
    const id=(event.message as {workbenchInputId?:string}).workbenchInputId;
    if(id&&this.pending.delete(id))this.track(this.report(id,'applied').then(()=>{}));
  }
  stop(){this.closed=true;this.session.clearQueue();}
  async close(){this.closed=true;while(this.tasks.size)await Promise.allSettled([...this.tasks]);
    for(const id of this.pending)await this.report(id,'not_applied','执行已结束，指导未进入原生轮次');this.pending.clear();
    if(this.failure)throw this.failure;
  }
}

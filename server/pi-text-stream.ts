import { randomUUID } from 'node:crypto';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { MessagePhase, TextChunk } from '../shared/run-stream.js';

/** Batch SDK text deltas; serialize durable acknowledgements with bounded pending memory. */
export class PiTextStream {
  private messageId='';private chunk=0;private buffer='';private received=0;
  private timer?:ReturnType<typeof setTimeout>;
  private tail:Promise<void>=Promise.resolve();private failure?:Error;private pendingBytes=0;
  constructor(private send:(chunk:TextChunk)=>Promise<unknown>,private fail:(error:Error)=>void){}
  observe(event:AgentSessionEvent) {
    if(this.failure)return;
    if(event.type==='message_start'&&event.message.role==='assistant'){
      this.flush('error');this.messageId=randomUUID();this.chunk=0;this.received=0;
    }
    if(event.type==='message_update'&&event.assistantMessageEvent.type==='text_delta'){
      this.buffer+=event.assistantMessageEvent.delta;this.received+=event.assistantMessageEvent.delta.length;
      if(this.buffer.length>=16384)this.flush();
      else if(!this.timer)this.timer=setTimeout(()=>this.flush(),200);
    }
    if(event.type==='message_end'&&event.message.role==='assistant'){
      const full=event.message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
      if(!this.received){this.buffer=full;this.received=full.length;}
      else if(full.length>this.received){this.buffer+=full.slice(this.received);this.received=full.length;}
      this.flush(event.message.stopReason==='aborted'?'cancelled':event.message.stopReason==='error'?'error':'final');
      this.messageId='';
    }
  }
  private flush(phase:MessagePhase='partial') {
    clearTimeout(this.timer);this.timer=undefined;
    if(!this.messageId || (!this.buffer && (phase==='partial'||!this.received)))return;
    do {
      let length=Math.min(this.buffer.length,16384);
      const last=this.buffer.charCodeAt(length-1);
      if(last>=0xD800&&last<=0xDBFF&&(length<this.buffer.length||phase==='partial'))length--;
      if(!length&&this.buffer)return;
      const text=this.buffer.slice(0,length);this.buffer=this.buffer.slice(text.length);
      const part:TextChunk={messageId:this.messageId,chunk:this.chunk++,text,phase:this.buffer?'partial':phase};
      this.pendingBytes+=Buffer.byteLength(text);
      if(this.pendingBytes>2*1024*1024){this.reject(new Error('回复保存速度不足，已停止以避免丢失内容'));this.buffer='';return;}
      this.tail=this.tail.then(async()=>{if(this.failure)return;try{await this.send(part);}catch(error){this.reject(error instanceof Error?error:new Error(String(error)));}finally{this.pendingBytes-=Buffer.byteLength(text);}});
    }while(this.buffer);
  }
  private reject(error:Error){if(!this.failure){this.failure=error;this.fail(error);}}
  async finish(){this.flush('error');await this.tail;if(this.failure)throw this.failure;}
}

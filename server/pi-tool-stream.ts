import { randomUUID } from 'node:crypto';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ToolProgress, TextChunk } from '../shared/run-stream.js';
import { nativeOutputChunks } from './native-output.js';

function preview(result:unknown) {
  const blocks=(result as {content?:unknown[]}|undefined)?.content;
  if(!Array.isArray(blocks))return '工具返回结构化结果，查看完整记录。';
  let text='';for(const block of blocks){const value=block as {type?:string;text?:string};if(value.type==='text'&&typeof value.text==='string')text+=(text?'\n':'')+value.text.slice(0,2000-text.length);if(text.length>=2000)break;}
  return text.slice(0,2000).replace(/[\uD800-\uDBFF]$/,'')||'工具返回非文本内容，查看完整记录。';
}
export class PiToolStream {
  private active=new Map<string,{value:ToolProgress;latest?:unknown;timer?:ReturnType<typeof setTimeout>}>();
  private tail:Promise<void>=Promise.resolve();private failure?:Error;private pendingBytes=0;
  constructor(private runId:string,private source:(name:string)=>string,private send:(type:'tool_progress'|'text_chunk',value:ToolProgress|TextChunk)=>Promise<unknown>,private fail:()=>void,private outputDir?:string,private attempted?:(callId:string)=>boolean){}
  private enqueue(bytes:number,work:()=>Promise<void>){
    this.pendingBytes+=bytes;
    if(this.pendingBytes>8*1024*1024){this.reject(new Error('工具结果等待保存的内容超过上限'));return;}
    this.tail=this.tail.then(async()=>{if(this.failure)return;try{await work();}catch(e){this.reject(e instanceof Error?e:new Error(String(e)));}finally{this.pendingBytes-=bytes;}});
  }
  private reject(error:Error){if(!this.failure){this.failure=error;this.fail();}}
  private progress(value:ToolProgress){this.enqueue(Buffer.byteLength(value.preview),async()=>{await this.send('tool_progress',value);});}
  async beforeCall(callId:string,name:string){
    if(!this.active.has(callId))this.observe({type:'tool_execution_start',toolCallId:callId,toolName:name,args:{}});
    await this.tail;if(this.failure)throw this.failure;
  }
  observe(event:AgentSessionEvent){
    if(this.failure)return;
    if(event.type==='tool_execution_start'){
      if(this.active.has(event.toolCallId))return;
      const value:ToolProgress={callId:event.toolCallId,name:event.toolName,source:this.source(event.toolName),sequence:0,phase:'running',preview:'开始执行'};
      this.active.set(event.toolCallId,{value});this.progress({...value});
    }else if(event.type==='tool_execution_update'){
      const current=this.active.get(event.toolCallId);if(!current)return;
      current.latest=preview(event.partialResult);
      if(!current.timer)current.timer=setTimeout(()=>{
        current.timer=undefined;
        current.value={...current.value,sequence:current.value.sequence+1,preview:String(current.latest)};
        this.progress({...current.value});
      },200);
    }else if(event.type==='tool_execution_end'){
      const current=this.active.get(event.toolCallId);if(!current)return;
      clearTimeout(current.timer);this.active.delete(event.toolCallId);
      let serialized:string;
      try{serialized=JSON.stringify(event.result)??'null';}catch{this.reject(new Error('工具结果无法序列化，保留已有进度'));return;}
      const messageId=randomUUID();
      const final:ToolProgress={...current.value,sequence:current.value.sequence+1,phase:event.isError?'failed':'completed',preview:preview(event.result),resultMessageId:`${this.runId}:${messageId}`};
      if(event.isError&&current.value.source==='builtin:mcp'&&event.toolName.startsWith('mcp__')&&(this.attempted?.(event.toolCallId)??true))final.outcomeUnknown=true;
      this.enqueue(Buffer.byteLength(serialized),async()=>{
        const fullPath=(event.result as {details?:{fullOutputPath?:unknown}})?.details?.fullOutputPath;
        if(fullPath!==undefined&&current.value.source==='工作台/原生工具'&&['bash','powershell'].includes(event.toolName)){
          if(!this.outputDir||typeof fullPath!=='string')throw new Error('缺少原始命令输出归属');
          const outputId=randomUUID();let chunk=0;let previous:string|undefined;
          for await(const text of nativeOutputChunks(this.outputDir,fullPath,event.toolName)){
            if(previous!==undefined)await this.send('text_chunk',{messageId:outputId,channel:'tool_result',chunk:chunk++,text:previous,phase:'partial'});
            previous=text;
          }
          await this.send('text_chunk',{messageId:outputId,channel:'tool_result',chunk,text:previous??'',phase:'final'});
          final.outputMessageId=`${this.runId}:${outputId}`;
        }
        let offset=0;let chunk=0;
        while(offset<serialized.length){
          let end=Math.min(offset+16384,serialized.length);if(/[\uD800-\uDBFF]/.test(serialized.charAt(end-1))&&end<serialized.length)end--;
          await this.send('text_chunk',{messageId,channel:'tool_result',chunk:chunk++,text:serialized.slice(offset,end),phase:end===serialized.length?'final':'partial'});offset=end;
        }
        await this.send('tool_progress',final);
      });
    }
  }
  async finish(){
    for(const current of this.active.values()){
      clearTimeout(current.timer);current.timer=undefined;
      if(current.latest!==undefined&&current.value.preview!==String(current.latest)){
        current.value={...current.value,sequence:current.value.sequence+1,preview:String(current.latest)};
        this.progress({...current.value});
      }
    }
    await this.tail;if(this.failure)throw this.failure;
  }
}

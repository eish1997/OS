import type { AssistantMessageEvent } from '@earendil-works/pi-ai';
import { isContextOverflow, isRetryableAssistantError } from '@earendil-works/pi-ai/compat';
import type { ModelUsage } from '../shared/contracts.js';

// Settle the provider stream before Pi can start the next request or persist its
// terminal message. Session listeners may run later than the underlying stream.
export async function* accountedStream(source:AsyncIterable<AssistantMessageEvent>,receipt:(cost:number|undefined,usage:ModelUsage|undefined)=>Promise<unknown>,started:()=>void):AsyncGenerator<AssistantMessageEvent> {
  let settled=false;let observed=false;
  try {
    for await(const event of source) {
      if(!observed && ['text_delta','thinking_delta','toolcall_delta'].includes(event.type)){observed=true;started();}
      if(event.type==='done'||event.type==='error') {
        settled=true;
        const message=event.type==='done'?event.message:event.error;
        const usage=message.usage;const complete=event.type==='done';
        await receipt(complete?usage?.cost?.total:undefined,usage?{input:usage.input,output:usage.output,cacheRead:usage.cacheRead,cacheWrite:usage.cacheWrite,totalTokens:usage.totalTokens,complete}:undefined);
      }
      // Provider exceptions may echo request material. Persist only a safe
      // explanation in the native transcript; the host keeps typed stage codes.
      // Pi classifies recovery by the message. Keep only a fixed safe category,
      // otherwise sanitizing provider errors would disable its recovery logic.
      const safeError = event.type === 'error' ? isContextOverflow(event.error)
        ? 'Context length exceeded；上下文需要压缩。'
        : isRetryableAssistantError(event.error)
          ? 'Service unavailable；模型服务暂时不可用。'
          : '模型请求未正常完成；本次回报可能不完整。' : undefined;
      yield event.type==='error'?{...event,error:{...event.error,errorMessage:safeError}}:event;
    }
  } finally {if(!settled)await receipt(undefined,undefined);}
}

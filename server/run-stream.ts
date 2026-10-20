import { isLiveExecution, type Run } from '../shared/contracts.js';
import type { RunMessage, TextChunk } from '../shared/run-stream.js';
import { Store, AppError } from './store.js';
import { createHash } from 'node:crypto';

export function persistTextChunk(store: Store, runId: string, input: TextChunk) {
  if (!input || typeof input.messageId!=='string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.messageId) || !Number.isSafeInteger(input.chunk) || input.chunk<0 || typeof input.text!=='string' || input.text.length>16384 || !['partial','final','error','cancelled'].includes(input.phase)) throw new AppError(400,'回复分块格式无效');
  const id=`${runId}:${input.messageId}`;
  const channel=input.channel??'assistant';
  if(!['assistant','tool_result'].includes(channel))throw new AppError(400,'输出类别无效');
  const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return store.command(`stream:${id}:${input.chunk}`,digest,()=>{
    const run=store.get<Run>('run',runId);
    if(!isLiveExecution(run.status))throw new AppError(409,'执行已结束，不能追加回复');
    let current:RunMessage|undefined;
    const row=store.db.prepare("SELECT body FROM entities WHERE kind='run_message' AND id=?").get(id);
    if(row)current=JSON.parse(String(row.body)) as RunMessage;
    if(current && current.schemaVersion!==1)throw new AppError(409,'回复记录版本不受支持，保留原文');
    if(current && (current.channel??'assistant')!==channel)throw new AppError(409,'输出类别不能改变');
    if(input.chunk!==(current?.nextChunk??0) || current && current.phase!=='partial')throw new AppError(409,'回复分块顺序或终态冲突');
    let preview=current && current.characters>current.preview.length ? current.preview : ((current?.preview??'')+input.text).slice(0,30000);
    if(/[\uD800-\uDBFF]$/.test(preview))preview=preview.slice(0,-1);
    const fields={nextChunk:input.chunk+1,preview,characters:(current?.characters??0)+input.text.length,phase:input.phase};
    if(current)store.update<RunMessage>('run_message',id,current.revision,fields);
    else {
      store.create<RunMessage>('run_message',{id,schemaVersion:1,projectId:run.projectId,runId,channel,...fields});
      store.event(channel==='assistant'?'assistant.message':'tool.result',{messageId:id},{projectId:run.projectId,runId});
    }
    store.event(channel==='assistant'?'assistant.delta':'tool.delta',{messageId:id,chunk:input.chunk,text:input.text,phase:input.phase},{projectId:run.projectId,runId});
    return {stored:true};
  });
}

export function messageChunks(store:Store,runId:string,id:string,after=-1) {
  const message=store.get<RunMessage>('run_message',id);
  if(message.runId!==runId)throw new AppError(403,'回复不属于当前执行');
  const type=message.channel==='tool_result'?'tool.delta':'assistant.delta';
  const rows=store.db.prepare(`SELECT body FROM events WHERE json_extract(body,'$.schemaVersion')=1 AND json_extract(body,'$.type')='${type}' AND json_extract(body,'$.runId')=? AND json_extract(body,'$.data.messageId')=? AND json_extract(body,'$.data.chunk')>? ORDER BY json_extract(body,'$.data.chunk') LIMIT 50`).all(runId,id,after);
  return rows.map(row=>(JSON.parse(String(row.body)) as {data:TextChunk}).data);
}

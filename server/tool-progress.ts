import { createHash } from 'node:crypto';
import { isLiveExecution, type Run } from '../shared/contracts.js';
import type { RunMessage, ToolExecution, ToolProgress, ToolReconciliation } from '../shared/run-stream.js';
import { Store, AppError } from './store.js';

export function persistToolProgress(store:Store,runId:string,input:ToolProgress) {
  if(input?.outcomeUnknown!==undefined&&(input.outcomeUnknown!==true||input.phase!=='failed'||input.source!=='builtin:mcp'||!input.name?.startsWith('mcp__')))throw new AppError(400,'未知工具结果标记无效');
  if(!input || typeof input.callId!=='string'||!input.callId||input.callId.length>200||typeof input.name!=='string'||!input.name||input.name.length>200||typeof input.source!=='string'||input.source.length>2000||!Number.isSafeInteger(input.sequence)||input.sequence<0||!['running','completed','failed'].includes(input.phase)||typeof input.preview!=='string'||input.preview.length>2000)throw new AppError(400,'工具进度格式无效');
  const id=`${runId}:${createHash('sha256').update(input.callId).digest('hex')}`;
  return store.command(`tool-progress:${id}:${input.sequence}`,createHash('sha256').update(JSON.stringify(input)).digest('hex'),()=>{
    const run=store.get<Run>('run',runId);if(!isLiveExecution(run.status))throw new AppError(409,'执行已结束');
    const row=store.db.prepare("SELECT body FROM entities WHERE kind='tool_execution' AND id=?").get(id);
    const current=row?JSON.parse(String(row.body)) as ToolExecution:undefined;
    if(current&&current.schemaVersion!==1)throw new AppError(409,'工具记录版本不受支持，保留原文');
    if(!current&&input.phase!=='running')throw new AppError(409,'工具尚无开始记录');
    if(input.sequence!==(current?current.sequence+1:0)||current&&(current.phase!=='running'||current.name!==input.name||current.source!==input.source))throw new AppError(409,'工具进度顺序或终态冲突');
    for(const messageId of [input.resultMessageId,input.outputMessageId].filter(Boolean)){
      const result=store.get<RunMessage>('run_message',messageId!);if(result.runId!==runId||result.channel!=='tool_result'||result.phase!=='final')throw new AppError(409,'工具完整结果尚未保存或归属不符');
    }
    if(input.phase!=='running'&&!input.resultMessageId)throw new AppError(409,'工具结束必须包含完整结果');
    const next=current?store.update<ToolExecution>('tool_execution',id,current.revision,input):store.create<ToolExecution>('tool_execution',{id,schemaVersion:1,projectId:run.projectId,runId,...input});
    store.event('tool.progress',{id:next.id,phase:next.phase},{projectId:run.projectId,runId});return {stored:true};
  });
}

export function toolExecutions(store:Store,runId:string,after=0){
  store.get<Run>('run',runId);
  if(!Number.isSafeInteger(after)||after<0)throw new AppError(400,'工具分页无效');
  const rows=store.db.prepare("SELECT rowid,body FROM entities WHERE kind='tool_execution' AND json_extract(body,'$.runId')=? AND rowid>? ORDER BY rowid LIMIT 51").all(runId,after);
  return {items:rows.slice(0,50).map(r=>JSON.parse(String(r.body)) as ToolExecution),nextAfter:rows.length>50?Number(rows[49].rowid):undefined};
}

/** Include older attempts and native continuation ancestors, not unrelated conversations. */
export function recoveryTools(store:Store,runId:string):ToolExecution[]{
  const origin=store.get<Run>('run',runId);const runs=store.list<Run>('run',origin.projectId);
  const ids=new Set<string>();const pending=[runId];
  while(pending.length){const id=pending.pop()!;if(ids.has(id))continue;const run=runs.find(r=>r.id===id);if(!run)throw new AppError(409,'恢复来源归属不明');ids.add(id);
    if(run.parentRunId)pending.push(run.parentRunId);if(run.continuation)pending.push(run.continuation.runId);
    for(const attempt of runs)if(attempt.taskId===run.taskId&&!ids.has(attempt.id))pending.push(attempt.id);
  }
  return store.list<ToolExecution>('tool_execution',origin.projectId).filter(t=>ids.has(t.runId));
}
export function requireToolReconciliation(store:Store,runId:string){
  if(recoveryTools(store,runId).some(t=>t.schemaVersion===1&&(t.phase==='running'||t.outcomeUnknown)&&!t.reconciliation))throw new AppError(409,'工具结果尚未确认，请在实际工具调用中核对副作用后继续');
}
/** Force-stop can race tool_execution_end while killing; failed receipts without reconciliation are not settled. */
export function reopenForceStoppedTools(store:Store,runId:string){
  for(const tool of store.list<ToolExecution>('tool_execution').filter(t=>t.runId===runId)){
    if(tool.schemaVersion!==1||tool.phase!=='failed'||tool.reconciliation)continue;
    store.update<ToolExecution>('tool_execution',tool.id,tool.revision,{phase:'running',outcomeUnknown:undefined,resultMessageId:undefined,preview:'强制停止时结果未确认'});
  }
}
export function reconcileTool(store:Store,runId:string,id:string,revision:number,outcome:ToolReconciliation['outcome'],evidence:string){
  if(!['performed','not_performed','partial'].includes(outcome)||typeof evidence!=='string'||!evidence.trim()||evidence.length>4000||!Number.isSafeInteger(revision)||revision<1)throw new AppError(400,'需要有效核对结论、依据和版本');
  return store.transaction(()=>{
    const run=store.get<Run>('run',runId);const tool=store.get<ToolExecution>('tool_execution',id);
    if(tool.schemaVersion!==1)throw new AppError(409,'工具记录版本不受支持，保留原文');
    if(tool.runId!==runId||tool.projectId!==run.projectId)throw new AppError(403,'工具不属于当前执行');
    if(!['completed','failed','cancelled','interrupted'].includes(run.status))throw new AppError(409,'执行尚未结束，不能确认工具结果');
    if(run.workerPid)try{process.kill(run.workerPid,0);throw new AppError(409,'原执行进程仍存在，请等待退出并核对命令子进程');}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ESRCH'))throw error;}
    if(tool.phase!=='running'&&!tool.outcomeUnknown)throw new AppError(409,'工具已有实际终态，无需人工覆盖');
    if(tool.reconciliation){if(tool.reconciliation.outcome===outcome&&tool.reconciliation.evidence===evidence.trim()&&revision===tool.revision-1)return tool;throw new AppError(409,'工具已核对，请刷新记录');}
    const next=store.update<ToolExecution>('tool_execution',id,revision,{reconciliation:{outcome,evidence:evidence.trim(),confirmedAt:new Date().toISOString()}});
    store.event('tool.reconciled',{id,outcome,verification:'user-confirmed'},{projectId:run.projectId,runId});return next;
  });
}

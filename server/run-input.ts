import {createHash} from 'node:crypto';
import {isLiveExecution,type Run} from '../shared/contracts.js';
import type {RunInput,RunInputState} from '../shared/run-input.js';
import {Store,AppError} from './store.js';

export function inputFingerprint(runId:string,conversationId:string,text:string){return createHash('sha256').update(JSON.stringify({runId,conversationId,text})).digest('hex');}
export function inputView(store:Store,input:RunInput):RunInput{
  if(input.schemaVersion!==1)return {...input,state:'unknown',reason:'指导记录版本不受支持，不会按当前规则应用'};
  const run=store.get<Run>('run',input.runId);
  return ['accepted','queued'].includes(input.state)&&!isLiveExecution(run.status)?{...input,state:'unknown',reason:'执行已结束，未收到应用回执；请核对历史后决定是否重新发送'}:input;
}
export function acceptRunInput(store:Store,runId:string,conversationId:string,commandId:string,text:string):{input:RunInput;fresh:boolean}{
  if(typeof commandId!=='string'||!commandId||commandId.length>120||typeof text!=='string'||!text.trim()||text.length>30000||typeof conversationId!=='string')throw new AppError(400,'指导内容、话题或命令ID无效');
  const key=`run-input:${commandId}`;const digest=inputFingerprint(runId,conversationId,text);
  const receipt=store.commandReceipt<{id:string}>(key,digest);
  if(receipt)return {input:inputView(store,store.get<RunInput>('run_input',receipt.value.id)),fresh:false};
  const result=store.command(key,digest,()=>{
    const run=store.get<Run>('run',runId);
    if(run.conversationId!==conversationId)throw new AppError(403,'指导目标不属于当前话题');
    if(run.mode!=='pi'||!isLiveExecution(run.status)||run.cancelRequested||run.timedOutAt||run.sessionAction==='compact'||run.sessionAction==='regenerate')throw new AppError(409,'目标执行已结束、正在停止或不能接收指导；请明确选择新任务');
    if(store.list<RunInput>('run_input',run.projectId).filter(i=>i.runId===runId&&['accepted','queued'].includes(i.state)).length>=32)throw new AppError(409,'待应用指导过多，请等待处理');
    const input=store.create<RunInput>('run_input',{schemaVersion:1,projectId:run.projectId,runId,conversationId,commandId,text,state:'accepted'});
    store.event('run.input',{id:input.id},{projectId:run.projectId,runId});return {id:input.id};
  });
  return {input:store.get<RunInput>('run_input',result.id),fresh:true};
}
export function updateRunInput(store:Store,runId:string,id:string,state:RunInputState,reason?:string){
  if(!['queued','applied','handled','not_applied','unknown'].includes(state))throw new AppError(400,'指导回执无效');
  return store.transaction(()=>{
    const current=store.get<RunInput>('run_input',id);
    if(current.schemaVersion!==1)throw new AppError(409,'指导记录版本不受支持，保留原文');
    if(current.runId!==runId)throw new AppError(403,'指导回执归属不符');
    if(current.state===state)return current;
    if(!['accepted','queued'].includes(current.state)||current.state==='accepted'&&state==='applied')throw new AppError(409,'指导回执顺序冲突');
    const next=store.update<RunInput>('run_input',id,current.revision,{state,reason:reason?.slice(0,500)});
    store.event('run.input_state',{id,state},{projectId:current.projectId,runId});return next;
  });
}

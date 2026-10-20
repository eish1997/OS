import type {Run} from '../shared/contracts.js';
import {isLiveExecution} from '../shared/contracts.js';
import type {PluginInteraction,PluginInteractionRequest,PluginInteractionAnswer} from '../shared/plugin-interaction.js';
import {allowedExtensionSource} from './mcp-runtime.js';
import {AppError,Store} from './store.js';

const openStates=['pending','answered'];
function live(run:Run){return isLiveExecution(run.status)&&!run.cancelRequested&&!run.timedOutAt;}
function boundedText(value:unknown,max:number,required=false){return typeof value==='string'&&value.length<=max&&!value.includes('\0')&&(!required||value.trim().length>0);}
function openWaiting(store:Store,runId:string,projectId:string,now:number){
  return store.list<PluginInteraction>('plugin_interaction',projectId).some(item=>item.runId===runId&&openStates.includes(item.state)&&openStates.includes(interactionView(store,item,now).state));
}
/**
 * Dialog waits use waiting_interaction, never waiting_user (model auth).
 * Runs in its own transactions and retries CAS conflicts with lease renewal.
 */
export function syncInteractionWait(store:Store,runId:string,now=Date.now()){
  for(let attempt=0;attempt<8;attempt++){
    try{
      store.transaction(()=>{
        const run=store.get<Run>('run',runId);
        if(!live(run))return;
        const waiting=openWaiting(store,runId,run.projectId,now);
        if(waiting&&run.status==='running'){
          const next=store.update<Run>('run',runId,run.revision,{status:'waiting_interaction'});
          store.event('run.status',{status:'waiting_interaction'},{projectId:run.projectId,runId,revision:next.revision});
        }else if(!waiting&&run.status==='waiting_interaction'){
          const next=store.update<Run>('run',runId,run.revision,{status:'running'});
          store.event('run.status',{status:'running'},{projectId:run.projectId,runId,revision:next.revision});
        }
      });
      return;
    }catch(error){
      if(error instanceof AppError&&error.status===409)continue;
      throw error;
    }
  }
}

/** Only schemaVersion 1 is answerable. Missing or newer records are not treated as the current contract. */
function supportedInteraction(item:PluginInteraction){return item.schemaVersion===1;}

/** Recovery view never reopens a dialog merely because its worker disappeared. */
export function interactionView(store:Store,item:PluginInteraction,now=Date.now()):PluginInteraction {
  if(!supportedInteraction(item))return {...item,state:'closed',closedReason:'交互记录版本不受支持，不会按当前规则应用'};
  if(!openStates.includes(item.state))return item;
  if(!live(store.get<Run>('run',item.runId)))return {...item,state:'closed',closedReason:'执行已停止，旧答复不会应用到新执行'};
  if(Date.parse(item.expiresAt)<=now)return {...item,state:'expired',closedReason:'等待答复已到期'};
  return item;
}

export function createInteraction(store:Store,runId:string,request:PluginInteractionRequest,now=Date.now()):PluginInteraction {
  if(!boundedText(request.id,120,true)||!boundedText(request.source,4096,true)||!['confirm','input','select'].includes(request.kind)||!boundedText(request.title,2000,true)||(request.message!==undefined&&!boundedText(request.message,4000))||!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>24*60*60*1000)throw new AppError(400,'插件交互请求无效');
  if(request.kind==='select'){
    if(!Array.isArray(request.options)||request.options.length<1||request.options.length>100||request.options.some(option=>!boundedText(option,1000,true))||new Set(request.options).size!==request.options.length)throw new AppError(400,'插件选择项无效');
  }else if(request.options!==undefined)throw new AppError(400,'当前交互不支持选择项');
  const value=store.transaction(()=>{
    const run=store.get<Run>('run',runId);
    if(!allowedExtensionSource(run,request.source))throw new AppError(403,'插件交互来源不属于当前执行');
    const existing=store.list<PluginInteraction>('plugin_interaction',run.projectId).find(item=>item.id===request.id);
    if(existing){
      if(existing.runId!==runId||existing.source!==request.source||existing.kind!==request.kind||existing.title!==request.title||existing.message!==request.message||JSON.stringify(existing.options)!==JSON.stringify(request.options))throw new AppError(409,'交互ID已用于不同请求');
      return interactionView(store,existing,now);
    }
    if(run.mode!=='pi'||!live(run))throw new AppError(409,'执行已停止，不能请求用户答复');
    const cap=run.policy.piRuntime?.userWaitTimeoutMs;
    if(cap!==undefined&&(!Number.isSafeInteger(cap)||cap<1000||cap>86400000))throw new AppError(400,'运行等待上限无效');
    const waitMs=Math.min(request.timeoutMs,cap??request.timeoutMs);
    const prior=store.list<PluginInteraction>('plugin_interaction',run.projectId).filter(item=>item.runId===runId);
    if(prior.length>=500||prior.filter(item=>interactionView(store,item,now).state==='pending').length>=16)throw new AppError(409,'插件交互请求过多');
    const created=store.create<PluginInteraction>('plugin_interaction',{id:request.id,schemaVersion:1,projectId:run.projectId,runId,source:request.source,kind:request.kind,title:request.title,message:request.message,options:request.options,expiresAt:new Date(now+waitMs).toISOString(),state:'pending'});
    store.event('run.interaction',{id:created.id},{runId,projectId:run.projectId});return created;
  });
  syncInteractionWait(store,runId,now);return value;
}

/** Persist acceptance before delivering. Answers stay in memory, never in SQLite/events. */
export function answerInteraction(store:Store,runId:string,id:string,revision:number,commandId:string,answer:PluginInteractionAnswer,now=Date.now()):{interaction:PluginInteraction;fresh:boolean;answer?:PluginInteractionAnswer}{
  if(!boundedText(commandId,120,true)||!Number.isSafeInteger(revision)||revision<1)throw new AppError(400,'交互答复标识无效');
  // Receipts and already-final conflicts are read-only. A worker can be saving its
  // history concurrently; that storage lock must not prevent retrieving a receipt.
  const previous=store.get<PluginInteraction>('plugin_interaction',id);
  if(previous.runId!==runId)throw new AppError(403,'交互不属于当前执行');
  if(previous.answerCommandId===commandId)return {interaction:interactionView(store,previous,now),fresh:false};
  if(interactionView(store,previous,now).state!=='pending'||previous.revision!==revision)throw new AppError(409,'交互已答复、已到期或执行已停止，请刷新状态');
  const result=store.transaction(()=>{
    const item=store.get<PluginInteraction>('plugin_interaction',id);
    if(item.runId!==runId)throw new AppError(403,'交互不属于当前执行');
    // A retry retrieves the original receipt, and can never replace or resend its answer.
    if(item.answerCommandId===commandId)return {interaction:interactionView(store,item,now),fresh:false as const};
    if(interactionView(store,item,now).state!=='pending'||item.revision!==revision)throw new AppError(409,'交互已答复、已到期或执行已停止，请刷新状态');
    if(answer!==null){
      if(item.kind==='confirm'&&typeof answer!=='boolean'||item.kind==='input'&&!boundedText(answer,16000)||item.kind==='select'&&(typeof answer!=='string'||!item.options?.includes(answer)))throw new AppError(400,'交互答复格式无效');
    }
    const next=store.update<PluginInteraction>('plugin_interaction',id,item.revision,{state:'answered',answerCommandId:commandId,answeredAt:new Date(now).toISOString()});
    store.event('run.interaction_answered',{id},{runId,projectId:item.projectId});return {interaction:next,fresh:true as const,answer};
  });
  syncInteractionWait(store,runId,now);return result;
}

export function acknowledgeInteraction(store:Store,runId:string,id:string,now=Date.now()){
  const next=store.transaction(()=>{
    const item=store.get<PluginInteraction>('plugin_interaction',id);
    if(item.runId!==runId)throw new AppError(403,'交互回执归属不符');
    if(item.state==='delivered')return item;
    if(item.state!=='answered'||interactionView(store,item,now).state!=='answered')throw new AppError(409,'交互答复不再可交付');
    const value=store.update<PluginInteraction>('plugin_interaction',id,item.revision,{state:'delivered',deliveredAt:new Date(now).toISOString()});
    store.event('run.interaction_delivered',{id},{runId,projectId:item.projectId});return value;
  });
  syncInteractionWait(store,runId,now);return next;
}

export function closeInteractions(store:Store,runId:string,reason:'worker_exited'|'cancelled'|'expired'|'restored',now=Date.now()){
  const count=store.transaction(()=>{
    const run=store.get<Run>('run',runId);let closed=0;
    for(const item of store.list<PluginInteraction>('plugin_interaction',run.projectId).filter(item=>item.runId===runId&&openStates.includes(item.state))){
      if(reason==='expired'&&Date.parse(item.expiresAt)>now)continue;
      store.update<PluginInteraction>('plugin_interaction',item.id,item.revision,{state:reason==='expired'?'expired':'closed',closedReason:reason});
      store.event('run.interaction_closed',{id:item.id,reason},{runId,projectId:run.projectId});closed++;
    }
    return closed;
  });
  syncInteractionWait(store,runId,now);return count;
}

export function closeInteraction(store:Store,runId:string,id:string){
  const next=store.transaction(()=>{
    const item=store.get<PluginInteraction>('plugin_interaction',id);
    if(item.runId!==runId)throw new AppError(403,'交互关闭归属不符');
    if(!openStates.includes(item.state))return item;
    const value=store.update<PluginInteraction>('plugin_interaction',id,item.revision,{state:Date.parse(item.expiresAt)<=Date.now()?'expired':'closed',closedReason:'插件已结束等待'});
    store.event('run.interaction_closed',{id},{runId,projectId:item.projectId});return value;
  });
  syncInteractionWait(store,runId);return next;
}

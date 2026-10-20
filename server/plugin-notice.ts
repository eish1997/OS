import {isLiveExecution,type Run} from '../shared/contracts.js';
import type {PluginNotice} from '../shared/plugin-interaction.js';
import {allowedExtensionSource} from './mcp-runtime.js';
import {AppError,Store} from './store.js';

export function recordPluginNotice(store:Store,runId:string,notice:Pick<PluginNotice,'id'|'source'|'level'|'message'|'truncated'>){
  if(!notice||typeof notice.id!=='string'||!notice.id||notice.id.length>120||typeof notice.source!=='string'||!['info','warning','error'].includes(notice.level)||typeof notice.message!=='string'||!notice.message.trim()||notice.message.length>8000||(notice.truncated!==undefined&&notice.truncated!==true))throw new AppError(400,'插件通知无效');
  return store.transaction(()=>{
    const run=store.get<Run>('run',runId);if(!allowedExtensionSource(run,notice.source))throw new AppError(403,'插件通知来源不属于当前执行');
    const previous=store.list<PluginNotice>('plugin_notice',run.projectId);const duplicate=previous.find(item=>item.id===notice.id);
    if(duplicate){if(duplicate.runId!==runId||duplicate.source!==notice.source||duplicate.level!==notice.level||duplicate.message!==notice.message||duplicate.truncated!==notice.truncated)throw new AppError(409,'通知ID已用于不同内容');return duplicate;}
    if(!isLiveExecution(run.status))throw new AppError(409,'执行已结束，不能追加插件通知');
    if(previous.filter(item=>item.runId===runId).length>=101)throw new AppError(409,'插件通知数量超过本次运行上限');
    const value=store.create<PluginNotice>('plugin_notice',{id:notice.id,schemaVersion:1,projectId:run.projectId,runId,source:notice.source,level:notice.level,message:notice.message,truncated:notice.truncated});
    store.event('run.plugin_notice',{id:value.id},{projectId:run.projectId,runId});return value;
  });
}

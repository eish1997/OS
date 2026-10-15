import type { Entity } from '../shared/contracts.js';
import { defaultLayout, validateLayout, type LayoutRecord, type WorkbenchLayout } from '../shared/workbench-layout.js';
import { Store, AppError } from './store.js';
interface Configuration extends Entity { layout: WorkbenchLayout; previous?: WorkbenchLayout }
export class WorkbenchConfigurations {
  constructor(private store:Store) {}
  read():LayoutRecord {
    const record=this.store.list<Configuration>('workbench_config')[0];
    if(!record)return {revision:0,layout:defaultLayout()};
    try{validateLayout(record.layout);return {revision:record.revision,layout:record.layout,previous:record.previous};}
    catch {
      try{validateLayout(record.previous);return {revision:record.revision,layout:record.previous,recovery:'配置损坏，已读取上一有效版本；原记录未覆盖，请检查后保存'};}
      catch{return {revision:record.revision,layout:defaultLayout(),recovery:'配置无法恢复，已打开默认布局；原记录未覆盖，请检查后保存'};}
    }
  }
  save(revision:unknown,value:unknown):LayoutRecord {
    if(!Number.isSafeInteger(revision)||Number(revision)<0)throw new AppError(400,'配置修订号无效');
    try{validateLayout(value);}catch(e){throw new AppError(400,e instanceof Error?e.message:'配置无效');}
    for(const window of Object.values(value.windows)) {
      if(window.binding.projectId)this.store.get('project',window.binding.projectId);
      if(window.binding.conversationId){const conversation=this.store.get('conversation',window.binding.conversationId);if(conversation.projectId!==window.binding.projectId)throw new AppError(403,'窗口会话与项目不匹配');}
    }
    return this.store.transaction(()=>{
      const current=this.store.list<Configuration>('workbench_config')[0];
      if((current?.revision??0)!==revision)throw new AppError(409,'布局已在另一个页面更新，本地修改已保留；请重新加载或另存');
      let previous:WorkbenchLayout|undefined;
      try{validateLayout(current?.layout);previous=current!.layout;}catch{previous=this.read().layout;}
      const record=current?this.store.update<Configuration>('workbench_config',current.id,Number(revision),{layout:value,previous}):this.store.create<Configuration>('workbench_config',{id:'workbench-layout-v1',layout:value});
      this.store.event('workbench.saved',{revision:record.revision});return {revision:record.revision,layout:record.layout,previous:record.previous};
    });
  }
}

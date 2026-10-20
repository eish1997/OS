import { createWindow, type WindowInstance } from '../../shared/workbench-layout';
import type { ComponentType } from 'react';
import type { WindowContentProps } from './window-contract';
import { AssetsPane, ChatPane, DemoPane } from './panes';
import { PluginsPane } from './plugins';
export interface WindowDefinition {
  type:string; name:string; icon:string; instancePolicy:'multiple'|'single'|'resource-views';
  minimum:{width:number;height:number}; defaultSize:{width:number;height:number}; stateVersion:1;
  create:(projectId?:string)=>WindowInstance;
  canClose:(window:WindowInstance)=>string|undefined;
  component:ComponentType<WindowContentProps>;
  restore:(window:WindowInstance)=>WindowInstance;
}
const definition=(type:string,name:string,icon:string,policy:WindowDefinition['instancePolicy'],component:ComponentType<WindowContentProps>):WindowDefinition=>({type,name,icon,component,instancePolicy:policy,minimum:{width:240,height:160},defaultSize:{width:480,height:360},stateVersion:1,create:projectId=>createWindow(type,name,projectId),restore:window=>window,canClose:window=>type==='chat'&&String(window.view.input||'').trim()?'这个窗口还有未发送的文字。关闭后可从对话恢复草稿，是否关闭？':undefined});
export const windowRegistry:Record<string,WindowDefinition>=Object.assign(Object.create(null),{demo:definition('demo','布局演示','▤','multiple',DemoPane),assets:definition('assets','资产浏览','◇','resource-views',AssetsPane),chat:definition('chat','Pi 对话','✳','resource-views',ChatPane),plugins:{...definition('plugins','插件管理','◇','single',PluginsPane),create:()=>createWindow('plugins','插件管理')}});

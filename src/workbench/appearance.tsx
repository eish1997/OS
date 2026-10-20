import React from 'react';
import { defaultAppearance, type WorkbenchAppearance } from '../../shared/workbench-appearance';
import { Icon } from './icons';
import { PiExecutionSettings } from './pi-settings';

const base = {'bg-canvas':'#0d0d0d','bg-sidebar':'#141414','bg-surface':'#191919','bg-hover':'#242321','bg-paper':'#eeeeea','text-primary':'#eeeeee','text-secondary':'#b8b3b0','text-muted':'#a29b96','text-ink':'#24231f','border-subtle':'#393936','border-strong':'#807970','bg-selected':'#240046','text-selected':'#f3e8ff','accent-running':'#ee6018','status-danger':'#e88782','focus-ring':'#eeeeee','action-bg':'#eeeeea','action-text':'#24231f'};
export const palettes = {
  render:{name:'墨黑 · 紫色选中',description:'清晰的深色层级',colors:base},
  warm:{name:'暖灰',description:'柔和的中性色',colors:{...base,'bg-canvas':'#161513','bg-sidebar':'#1c1a17','bg-surface':'#24211d','bg-hover':'#302c26','bg-selected':'#403729','text-selected':'#fff2db','border-subtle':'#494239'}},
  graphite:{name:'石墨',description:'冷灰与低饱和蓝',colors:{...base,'bg-canvas':'#13171c','bg-sidebar':'#191e25','bg-surface':'#202630','bg-hover':'#2b3440','bg-selected':'#263e58','text-selected':'#e7f1ff','text-secondary':'#b4bfce','text-muted':'#a0adbf','border-subtle':'#3d4857','border-strong':'#8290a3'}},
  light:{name:'浅色',description:'明亮的纸面工作区',colors:{...base,'bg-canvas':'#f5f5f2','bg-sidebar':'#eeeee9','bg-surface':'#ffffff','bg-hover':'#e5e4df','bg-selected':'#e9ddf5','text-selected':'#3e1c5c','text-primary':'#24231f','text-secondary':'#55514b','text-muted':'#69635d','border-subtle':'#c2beb7','border-strong':'#787168','focus-ring':'#24231f','action-bg':'#24231f','action-text':'#ffffff','status-danger':'#a52d26'}},
};
export function appearanceStyle(value:WorkbenchAppearance):React.CSSProperties {
  return {...Object.fromEntries(Object.entries(palettes[value.theme].colors).map(([key,color])=>['--'+key,color])),'--line-width':`${value.lineWidth}px`,colorScheme:value.theme==='light'?'light':'dark'} as React.CSSProperties;
}
export function AppearanceSettings({value,onChange,onClose,status,onPlugins}:{value:WorkbenchAppearance;onChange:(value:WorkbenchAppearance)=>void;onClose:()=>void;status:string;onPlugins?:()=>void}){
  return <div className="wb-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="wb-modal wb-appearance" role="dialog" aria-modal="true" aria-label="外观设置">
    <header><div><p className="wb-caption">设置 / 外观</p><h2>让工作台适合你</h2></div><button aria-label="关闭设置" onClick={onClose}><Icon name="close"/></button></header>
    {onPlugins&&<button onClick={onPlugins}>打开插件管理 →</button>}
    <PiExecutionSettings/>
    <fieldset><legend>整体配色</legend><div className="wb-theme-grid">{Object.entries(palettes).map(([key,palette])=><label key={key} className={`wb-theme-option ${value.theme===key?'selected':''}`}><input type="radio" name="workbench-theme" value={key} checked={value.theme===key} onChange={()=>onChange({...value,theme:key as WorkbenchAppearance['theme']})}/><span className="wb-theme-swatch" aria-hidden="true">{['bg-canvas','bg-surface','bg-selected','text-primary'].map(token=><i key={token} style={{background:palette.colors[token as keyof typeof base]}}/>)}</span><strong>{palette.name}</strong><small>{palette.description}</small></label>)}</div></fieldset>
    <div className="wb-setting-row"><label htmlFor="wb-line-width">线条粗细<small>窗口边框、分隔线、菜单与控件边界</small></label><output htmlFor="wb-line-width">{value.lineWidth} px</output></div>
    <input id="wb-line-width" type="range" min="0.5" max="3" step="0.5" value={value.lineWidth} onChange={e=>onChange({...value,lineWidth:Number(e.target.value)})}/><div className="wb-range-labels"><span>细 · 0.5 px</span><span>粗 · 3 px</span></div>
    <label className="wb-collapse-setting"><input type="checkbox" checked={value.navigationCollapsed} onChange={e=>onChange({...value,navigationCollapsed:e.target.checked})}/>折叠空间导航</label>
    <footer><span role="status">{status}</span><button onClick={()=>onChange({...defaultAppearance})}>恢复默认外观</button><button className="wb-primary" onClick={onClose}>完成</button></footer><p className="wb-caption">实时生效并自动保存，所有空间共用。调整外观不会改变窗口位置。</p>
  </section></div>;
}

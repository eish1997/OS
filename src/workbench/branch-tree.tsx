import React,{useState} from 'react';
import type {NativeBranchPoint} from '../../shared/native-branch';
export function BranchTree({points,selected,onSelect,disabled,name}:{points:NativeBranchPoint[];selected:string;onSelect:(id:string)=>void;disabled:boolean;name:string}){
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());let hiddenBelow:number|undefined;
  const visible=points.filter(point=>{
    const depth=point.tree?.depth??0;
    if(hiddenBelow!==undefined&&depth>hiddenBelow)return false;
    hiddenBelow=collapsed.has(point.entryId)?depth:undefined;return true;
  });
  function toggle(point:NativeBranchPoint){
    const next=new Set(collapsed);if(next.has(point.entryId))next.delete(point.entryId);else{
      next.add(point.entryId);const start=points.indexOf(point);const chosen=points.findIndex(p=>p.entryId===selected);
      if(chosen>start){let descendant=true;for(let i=start+1;i<=chosen;i++)if((points[i].tree?.depth??0)<=(point.tree?.depth??0)){descendant=false;break;}if(descendant)onSelect('');}
    }setCollapsed(next);
  }
  return <div className="wb-branch-points" role="radiogroup" aria-label="历史节点树">
    {visible.map(p=><div key={p.entryId} className="wb-branch-node" style={{marginLeft:Math.min(p.tree?.depth??0,4)*12}}>
      {p.tree?.hasChildren&&<button disabled={disabled} aria-label={`${collapsed.has(p.entryId)?'展开':'收起'}节点 ${p.entryId} 的后续`} aria-expanded={!collapsed.has(p.entryId)} onClick={()=>toggle(p)}>{collapsed.has(p.entryId)?'▸ 展开':'▾ 收起'}</button>}
      <label><input type="radio" name={name} value={p.entryId} checked={selected===p.entryId} disabled={disabled} onChange={()=>onSelect(p.entryId)}/><span>{p.role==='user'?'你':'Pi'} · {p.preview||'（无文字）'}{p.imageCount>0?` · ${p.imageCount} 张图片`:''}<small>第 {(p.tree?.depth??0)+1} 层 · 节点 {p.entryId}{p.tree?.parentId?` · 来自 ${p.tree.parentId}`:' · 起点'}</small></span></label>
    </div>)}
  </div>;
}

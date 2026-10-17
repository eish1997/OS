/** Durable application layout, independent of the renderer and business entities. */
import { validAppearance, type WorkbenchAppearance } from './workbench-appearance.js';
export type DockNode = { kind: 'leaf'; id: string; windowId?: string } | { kind: 'split'; id: string; axis: 'x' | 'y'; ratio: number; first: DockNode; second: DockNode };
export interface WindowInstance { id: string; type: string; title: string; stateVersion: 1; binding: { projectId?: string; conversationId?: string }; view: Record<string, unknown> }
export interface FloatingWindow { windowId: string; x: number; y: number; width: number; height: number; pinned: boolean; mode: 'open' | 'icon' | 'collected'; iconX: number; iconY: number }
export interface Workspace { id: string; name: string; root: DockNode }
export interface WorkbenchLayout { activeProjectId?: string; schemaVersion: 1; activeWorkspaceId: string; workspaces: Workspace[]; windows: Record<string, WindowInstance>; floating: FloatingWindow[]; collection: { x: number; y: number }; appearance?: WorkbenchAppearance }
export interface LayoutRecord { revision: number; layout: WorkbenchLayout; previous?: WorkbenchLayout; recovery?: string }
export type Edge = 'left' | 'right' | 'top' | 'bottom';
const uid = () => globalThis.crypto.randomUUID();
export const leaf = (): DockNode => ({ kind: 'leaf', id: uid() });
export function defaultLayout(): WorkbenchLayout {
  const workspace = { id: uid(), name: '资产空间', root: defaultTree() };
  return { schemaVersion: 1, activeWorkspaceId: workspace.id, workspaces: [workspace], windows: {}, floating: [], collection: { x: 24, y: 24 } };
}
export function defaultTree(): DockNode {
  return { kind: 'split', id: uid(), axis: 'x', ratio: .2, first: leaf(), second: { kind: 'split', id: uid(), axis: 'x', ratio: .75, first: leaf(), second: leaf() } };
}
export function leaves(node: DockNode): Extract<DockNode, {kind:'leaf'}>[] { return node.kind === 'leaf' ? [node] : [...leaves(node.first), ...leaves(node.second)]; }
function mapNode(node: DockNode, id: string, fn: (node: DockNode) => DockNode): DockNode {
  if (node.id === id) return fn(node);
  return node.kind === 'leaf' ? node : { ...node, first: mapNode(node.first, id, fn), second: mapNode(node.second, id, fn) };
}
function removeNode(node: DockNode, id: string): DockNode | undefined {
  if (node.id === id) return;
  if (node.kind === 'leaf') return node;
  const first = removeNode(node.first, id), second = removeNode(node.second, id);
  return !first ? second : !second ? first : { ...node, first, second };
}
function removeWindow(node: DockNode, windowId: string): DockNode | undefined {
  if (node.kind === 'leaf') return node.windowId === windowId ? undefined : node;
  const first = removeWindow(node.first, windowId), second = removeWindow(node.second, windowId);
  return !first ? second : !second ? first : { ...node, first, second };
}
export function activeWorkspace(layout: WorkbenchLayout) { return layout.workspaces.find(w => w.id === layout.activeWorkspaceId)!; }
export function mutateLayout(layout: WorkbenchLayout, fn: (next: WorkbenchLayout) => void): WorkbenchLayout {
  const next = structuredClone(layout); fn(next); normalizePluginWindow(next); validateLayout(next); return next;
}
/** Preserve region geometry when copies/imports contain the instance-wide manager. */
export function normalizePluginWindow(layout: WorkbenchLayout) {
  const managers = Object.values(layout.windows).filter(w => w.type === 'plugins');
  if (managers[0]) managers[0].binding = {};
  const duplicateIds = new Set(managers.slice(1).map(w => w.id));
  for (const id of duplicateIds) delete layout.windows[id];
  for (const space of layout.workspaces) for (const region of leaves(space.root)) if (region.windowId && duplicateIds.has(region.windowId)) delete region.windowId;
  layout.floating = layout.floating.filter(f => !duplicateIds.has(f.windowId));
}
function detach(next: WorkbenchLayout, windowId: string) {
  next.floating = next.floating.filter(w => w.windowId !== windowId);
  for (const space of next.workspaces) space.root = removeWindow(space.root, windowId) ?? leaf();
}
export function splitRegion(layout: WorkbenchLayout, nodeId: string, axis: 'x'|'y'): WorkbenchLayout {
  return mutateLayout(layout, next => { const space = activeWorkspace(next); space.root = mapNode(space.root, nodeId, node => ({ kind:'split', id:uid(), axis, ratio:.5, first:node, second:leaf() })); });
}
export function resizeRegion(layout: WorkbenchLayout, nodeId: string, ratio: number): WorkbenchLayout {
  return mutateLayout(layout, next => { const space = activeWorkspace(next); space.root = mapNode(space.root, nodeId, node => node.kind === 'split' ? { ...node, ratio: Math.max(.05, Math.min(.95, ratio)) } : node); });
}
export function closeRegion(layout: WorkbenchLayout, nodeId: string): WorkbenchLayout {
  return mutateLayout(layout, next => {
    const space = activeWorkspace(next); const target = leaves(space.root).find(n => n.id === nodeId);
    if (target?.windowId) throw new Error('请先关闭或移动区域内的窗口');
    space.root = removeNode(space.root, nodeId) ?? leaf();
  });
}
export function createWindow(type: string, title: string, projectId?: string): WindowInstance {
  return { id: uid(), type, title, stateVersion:1, binding:{ projectId }, view:{} };
}
export function addWindow(layout: WorkbenchLayout, window: WindowInstance, nodeId?: string): WorkbenchLayout {
  return mutateLayout(layout, next => {
    if (next.windows[window.id]) throw new Error('窗口已存在');
    next.windows[window.id] = window;
    const target = leaves(activeWorkspace(next).root).find(n => (!nodeId || n.id === nodeId) && !n.windowId);
    if (target) target.windowId = window.id;
    else next.floating.push(floatAt(window.id, 80 + next.floating.length * 24, 60 + next.floating.length * 24));
  });
}
function floatAt(windowId: string, x: number, y: number): FloatingWindow { return { windowId, x, y, width:480, height:360, pinned:false, mode:'open', iconX:x, iconY:y }; }
export function floatWindow(layout: WorkbenchLayout, windowId: string, x=80, y=60): WorkbenchLayout {
  return mutateLayout(layout, next => { if (!next.windows[windowId]) throw new Error('窗口不存在'); const old = next.floating.find(w => w.windowId === windowId); detach(next, windowId); next.floating.push(old ? {...old, x, y, mode:'open'} : floatAt(windowId,x,y)); });
}
export function dockWindow(layout: WorkbenchLayout, windowId: string, nodeId: string, edge?: Edge): WorkbenchLayout {
  return mutateLayout(layout, next => {
    if (!next.windows[windowId]) throw new Error('窗口不存在');
    const target = leaves(activeWorkspace(next).root).find(n => n.id === nodeId);
    if (!target) throw new Error('停靠区域不存在');
    if (target.windowId === windowId) return;
    if (target.windowId && !edge) throw new Error('目标区域已占用，请选择边缘停靠');
    detach(next, windowId);
    const space = activeWorkspace(next);
    space.root = mapNode(space.root, nodeId, node => {
      if (!edge || (node.kind === 'leaf' && !node.windowId)) return { kind:'leaf', id:node.id, windowId };
      const insert: DockNode = {kind:'leaf', id:uid(), windowId}; const before = edge==='left'||edge==='top';
      return { kind:'split', id:uid(), axis:edge==='left'||edge==='right'?'x':'y', ratio:.5, first:before?insert:node, second:before?node:insert };
    });
  });
}
export function closeWindow(layout: WorkbenchLayout, windowId: string): WorkbenchLayout {
  return mutateLayout(layout, next => { detach(next,windowId); delete next.windows[windowId]; });
}
export function collectWindows(layout: WorkbenchLayout): WorkbenchLayout {
  return mutateLayout(layout, next => { const restore=next.floating.some(w=>w.mode==='collected'); for(const w of next.floating) { if(restore && w.mode==='collected') w.mode='open'; else if(!restore && w.mode==='open') w.mode='collected'; } });
}
export function addWorkspace(layout: WorkbenchLayout, name: string): WorkbenchLayout {
  return mutateLayout(layout, next => { const space={id:uid(),name,root:leaf()}; next.workspaces.push(space); next.activeWorkspaceId=space.id; });
}
export function duplicateWorkspace(layout: WorkbenchLayout, name: string): WorkbenchLayout {
  return mutateLayout(layout, next => {
    const root=structuredClone(activeWorkspace(next).root);
    function copy(node:DockNode) { node.id=uid(); if(node.kind==='split'){copy(node.first);copy(node.second);} else if(node.windowId){const old=next.windows[node.windowId];const item={...structuredClone(old),id:uid()};next.windows[item.id]=item;node.windowId=item.id;} }
    copy(root);const space={id:uid(),name,root};next.workspaces.push(space);next.activeWorkspaceId=space.id;
  });
}
export function resetWorkspace(layout: WorkbenchLayout, blank=false): WorkbenchLayout {
  return mutateLayout(layout,next=>{const space=activeWorkspace(next);for(const n of leaves(space.root))if(n.windowId)delete next.windows[n.windowId];space.root=blank?leaf():defaultTree();});
}
export function deleteWorkspace(layout:WorkbenchLayout,id:string):WorkbenchLayout {
  return mutateLayout(layout,next=>{const space=next.workspaces.find(w=>w.id===id);if(!space)return;for(const n of leaves(space.root))if(n.windowId)delete next.windows[n.windowId];next.workspaces=next.workspaces.filter(w=>w.id!==id);if(!next.workspaces.length)next.workspaces.push({id:uid(),name:'新空间',root:leaf()});if(next.activeWorkspaceId===id)next.activeWorkspaceId=next.workspaces[0].id;});
}
/** Preserve the remote configuration and append an isolated copy of all local views. */
export function appendLayoutCopy(remote:WorkbenchLayout,local:WorkbenchLayout):WorkbenchLayout {
  return mutateLayout(remote,next=>{
    const ids=new Map<string,string>();
    for(const w of Object.values(local.windows)){const id=uid();ids.set(w.id,id);next.windows[id]={...structuredClone(w),id};}
    const copy=(node:DockNode):DockNode=>node.kind==='leaf'?{...node,id:uid(),windowId:node.windowId?ids.get(node.windowId):undefined}:{...node,id:uid(),first:copy(node.first),second:copy(node.second)};
    for(const space of local.workspaces){const id=uid();next.workspaces.push({id,name:(space.name+' 本地副本').slice(0,60),root:copy(space.root)});if(space.id===local.activeWorkspaceId)next.activeWorkspaceId=id;}
    for(const f of local.floating)next.floating.push({...f,windowId:ids.get(f.windowId)!,mode:f.mode==='collected'?'icon':f.mode});
  });
}

/** Reject malformed graphs before either rendering or persisting them. Unknown types remain recoverable. */
export function validateLayout(value: unknown): asserts value is WorkbenchLayout {
  const fail=()=>{throw new Error('工作台配置无效或超过限制');};
  const obj=(v:unknown):v is Record<string,any>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
  const str=(v:unknown,max=120):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
  const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000;
  if(!obj(value))return fail();const v=value;
  if(v.appearance!==undefined&&!validAppearance(v.appearance))return fail();
  if(v.schemaVersion!==1||!Array.isArray(v.workspaces)||!v.workspaces.length||v.workspaces.length>32||!obj(v.windows)||Object.keys(v.windows).length>256||!Array.isArray(v.floating)||!obj(v.collection)||!finite(v.collection.x)||!finite(v.collection.y))return fail();
  const nodes=new Set<string>(),spaces=new Set<string>(),seen=new Set<string>();let count=0;
  function reference(id:unknown){if(!str(id)||seen.has(id)||!Object.hasOwn(v.windows,id))return fail();seen.add(id);}
  function walk(n:unknown,depth:number){if(!obj(n)||depth>12||++count>512||!str(n.id)||nodes.has(n.id))return fail();nodes.add(n.id);
    if(n.kind==='leaf'){if(n.windowId!==undefined)reference(n.windowId);}
    else if(n.kind==='split'){if(!['x','y'].includes(n.axis)||!finite(n.ratio)||n.ratio<.05||n.ratio>.95)return fail();walk(n.first,depth+1);walk(n.second,depth+1);}else fail();}
  for(const s of v.workspaces){if(!obj(s)||!str(s.id)||spaces.has(s.id)||!str(s.name,60))return fail();spaces.add(s.id);walk(s.root,0);}
  if(!spaces.has(v.activeWorkspaceId))return fail();
  for(const f of v.floating){if(!obj(f)||!['open','icon','collected'].includes(f.mode)||typeof f.pinned!=='boolean'||![f.x,f.y,f.width,f.height,f.iconX,f.iconY].every(finite)||f.width<240||f.height<160)return fail();reference(f.windowId);}
  for(const [id,w] of Object.entries(v.windows)){if(!obj(w)||w.id!==id||!seen.has(id)||!str(w.type,80)||!str(w.title,120)||w.stateVersion!==1||!obj(w.binding)||!obj(w.view))return fail();for(const key of ['projectId','conversationId'])if(w.binding[key]!==undefined&&!str(w.binding[key]))return fail();}
  if(new TextEncoder().encode(JSON.stringify(value)).length>180000)fail();
}

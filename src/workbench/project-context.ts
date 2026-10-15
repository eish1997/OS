import { mutateLayout, type WorkbenchLayout, type WindowInstance } from '../../shared/workbench-layout';
import type { ViewPatch } from './window-contract';
type Context={binding:WindowInstance['binding'];view:Record<string,unknown>};
function contexts(w:WindowInstance){return (w.view.projectContexts||{}) as Record<string,Context>;}
function current(w:WindowInstance):Context{const {projectContexts,...view}=w.view;return {binding:{...w.binding},view};}
export function selectProject(layout:WorkbenchLayout,projectId:string){
  return mutateLayout(layout,next=>{
    next.activeProjectId=projectId||undefined;
    for(const w of Object.values(next.windows)){
      if(!['assets','chat'].includes(w.type)||w.binding.projectId===projectId)continue;
      const saved={...contexts(w),[w.binding.projectId||'']:current(w)};
      const restored=saved[projectId];
      w.binding=restored?{...restored.binding}:{projectId:projectId||undefined};
      w.view={...(restored?.view||{}),projectContexts:saved};
    }
  });
}
/** Async replies belong to the project in which the operation started. */
export function updateProjectWindow(w:WindowInstance,projectId:string|undefined,patch:ViewPatch,conversationId?:string){
  if(w.binding.projectId===projectId){
    Object.assign(w.view,typeof patch==='function'?patch(w.view):patch);
    if(conversationId)w.binding.conversationId=conversationId;
  }else{
    const saved={...contexts(w)},context=saved[projectId||'']||{binding:{projectId},view:{}};
    context.view={...context.view,...(typeof patch==='function'?patch(context.view):patch)};
    if(conversationId)context.binding={...context.binding,conversationId};
    saved[projectId||'']=context;w.view.projectContexts=saved;
  }
}

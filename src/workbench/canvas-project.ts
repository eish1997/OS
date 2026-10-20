import type { CanvasController } from './canvas-controller';
export interface CanvasProjectTarget { projectId:string|null; canvasId:string; draft:boolean }
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function resolveCanvasProject(projectId:string|null):Promise<CanvasProjectTarget>{
  const response=await fetch('/api/canvas/context',{headers:{'X-Canvas-Project':projectId??'personal'}});
  const value=await response.json();
  if(!response.ok)throw new Error(value.error??'无法打开项目画板');
  if(value.projectId!==projectId||!uuid.test(value.canvasId)||typeof value.draft!=='boolean')throw new Error('项目画板上下文无效');
  return value;
}
type Intent={projectId:string|null;resolve:(applied:boolean)=>void;reject:(error:unknown)=>void};
/** One in-flight switch, newest not-yet-started intent wins. Context adoption is
 * emitted by CanvasController only after the editor confirms its committed graph. */
export class CanvasProjectCoordinator {
  private pending?:Intent;
  private running=false;
  constructor(private readonly controller:()=>Pick<CanvasController,'openContext'>|null,
    private readonly resolveTarget:(projectId:string|null)=>Promise<CanvasProjectTarget>=resolveCanvasProject,
    private readonly onBusy:(busy:boolean)=>void=()=>{}){}
  select(projectId:string|null):Promise<boolean>{
    this.pending?.resolve(false);
    const result=new Promise<boolean>((resolve,reject)=>{this.pending={projectId,resolve,reject};});
    void this.drain();return result;
  }
  private async drain(){
    if(this.running)return;this.running=true;this.onBusy(true);
    try{
      while(this.pending){
        const intent=this.pending;this.pending=undefined;
        try{
          const controller=this.controller();if(!controller)throw new Error('画板连接尚未就绪，请稍后重试');
          const target=await this.resolveTarget(intent.projectId);
          if(this.pending){intent.resolve(false);continue;}
          await controller.openContext(target.projectId,target.canvasId,target.draft);
          intent.resolve(true);
        }catch(error){intent.reject(error);}
      }
    }finally{this.running=false;this.onBusy(false);}
  }
}

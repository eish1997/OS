import { Store, AppError } from './store.js';
import type { Project } from '../shared/contracts.js';

const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export interface CanvasBinding { canvasId:string; projectId:string|null; operationId:string; state:'prepared'|'ready'; revision:number }
/** Host-owned ownership ledger. Prepared rows reserve identity but never claim
 * that the independently persisted scene has committed. No scene writes here. */
export class CanvasBindings {
  constructor(private readonly store:Store){
    store.guardDatabase(4096,()=>store.db.exec(`
      CREATE TABLE IF NOT EXISTS canvas_bindings(
        canvas_id TEXT PRIMARY KEY,project_key TEXT NOT NULL,operation_id TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('prepared','ready')),revision INTEGER NOT NULL CHECK(revision>=0));
      CREATE INDEX IF NOT EXISTS canvas_bindings_scope ON canvas_bindings(project_key,state);
      CREATE TABLE IF NOT EXISTS canvas_recent(project_key TEXT PRIMARY KEY,canvas_id TEXT NOT NULL REFERENCES canvas_bindings(canvas_id));`));
  }
  private id(value:string){if(!uuid.test(value))throw new AppError(400,'画板身份无效');return value;}
  scope(projectId:string|null){
    if(projectId===null)return '';
    this.id(projectId);const project=this.store.get<Project>('project',projectId);
    if(project.archived)throw new AppError(409,'项目已归档，请先选择可用项目');
    return projectId;
  }
  private row(canvasId:string):CanvasBinding|undefined{
    const row=this.store.db.prepare('SELECT * FROM canvas_bindings WHERE canvas_id=?').get(this.id(canvasId));
    return row?{canvasId:String(row.canvas_id),projectId:row.project_key?String(row.project_key):null,operationId:String(row.operation_id),state:row.state as CanvasBinding['state'],revision:Number(row.revision)}:undefined;
  }
  find(canvasId:string){return this.row(canvasId);}
  /** Directory registration reserves a canvas before its first scene save.
   * The reservation operation id is the canvas id and is replaced by the real save. */
  reserve(projectId:string|null,canvasId:string):CanvasBinding{
    const key=this.scope(projectId);this.id(canvasId);
    return this.store.guardDatabase(512,()=>{
      const existing=this.row(canvasId);
      if(existing){
        if(existing.projectId!==projectId)throw new AppError(403,'画板属于其他项目');
        return existing;
      }
      if(this.store.db.prepare('SELECT 1 FROM canvas_bindings WHERE operation_id=?').get(canvasId))throw new AppError(409,'创建操作身份已用于其他画板');
      this.store.db.prepare('INSERT INTO canvas_bindings VALUES(?,?,?,?,?)').run(canvasId,key,canvasId,'prepared',0);
      return this.row(canvasId)!;
    });
  }
  adoptReservation(projectId:string|null,canvasId:string,operationId:string):CanvasBinding{
    this.id(operationId);
    return this.store.guardDatabase(256,()=>{
      const binding=this.authorize(projectId,canvasId,true);
      if(binding.operationId===operationId)return binding;
      if(binding.state!=='prepared'||binding.operationId!==canvasId)throw new AppError(409,'请先恢复原画板创建操作');
      if(this.store.db.prepare('SELECT 1 FROM canvas_bindings WHERE operation_id=?').get(operationId))throw new AppError(409,'创建操作身份已用于其他画板');
      this.store.db.prepare('UPDATE canvas_bindings SET operation_id=? WHERE canvas_id=?').run(operationId,canvasId);
      return this.row(canvasId)!;
    });
  }
  prepare(projectId:string|null,canvasId:string,operationId:string):CanvasBinding{
    const key=this.scope(projectId);this.id(canvasId);this.id(operationId);
    return this.store.guardDatabase(512,()=>{
      const existing=this.row(canvasId);
      if(existing){
        if(existing.projectId!==projectId)throw new AppError(403,'画板属于其他项目');
        if(existing.operationId!==operationId)throw new AppError(409,'画板已被其他创建操作登记');
        return existing;
      }
      if(this.store.db.prepare('SELECT 1 FROM canvas_bindings WHERE operation_id=?').get(operationId))throw new AppError(409,'创建操作身份已用于其他画板');
      this.store.db.prepare('INSERT INTO canvas_bindings VALUES(?,?,?,?,?)').run(canvasId,key,operationId,'prepared',0);
      return this.row(canvasId)!;
    });
  }
  confirm(projectId:string|null,canvasId:string,operationId:string,revision:number):CanvasBinding{
    if(!Number.isSafeInteger(revision)||revision<1)throw new AppError(400,'画板修订无效');
    return this.store.guardDatabase(256,()=>{
      const binding=this.authorize(projectId,canvasId,true);
      if(binding.operationId!==operationId)throw new AppError(409,'创建确认身份不匹配');
      this.store.db.prepare("UPDATE canvas_bindings SET state='ready',revision=max(revision,?) WHERE canvas_id=?").run(revision,canvasId);
      return this.row(canvasId)!;
    });
  }
  associate(projectId:string|null,canvasId:string,operationId:string,revision:number){
    return this.store.transaction(()=>{
      const current=this.find(canvasId);
      if(current)return this.authorize(projectId,canvasId);
      this.prepare(projectId,canvasId,operationId);
      return this.confirm(projectId,canvasId,operationId,revision);
    });
  }
  authorize(projectId:string|null,canvasId:string,allowPrepared=false):CanvasBinding{
    this.scope(projectId);const binding=this.row(canvasId);
    if(!binding||binding.projectId!==projectId)throw new AppError(403,'画板未关联当前项目');
    if(binding.state!=='ready'&&!allowPrepared)throw new AppError(409,'画板创建尚未确认，请恢复原操作');
    return binding;
  }
  list(projectId:string|null):CanvasBinding[]{
    const key=this.scope(projectId);
    return this.store.db.prepare('SELECT canvas_id FROM canvas_bindings WHERE project_key=? ORDER BY rowid').all(key).map(row=>this.row(String(row.canvas_id))!);
  }
  opened(projectId:string|null,canvasId:string){
    this.store.guardDatabase(128,()=>{
      this.authorize(projectId,canvasId);
      this.store.db.prepare('INSERT INTO canvas_recent VALUES(?,?) ON CONFLICT(project_key) DO UPDATE SET canvas_id=excluded.canvas_id').run(projectId??'',canvasId);
    });
  }
  recent(projectId:string|null):CanvasBinding|undefined{
    const key=this.scope(projectId),row=this.store.db.prepare('SELECT canvas_id FROM canvas_recent WHERE project_key=?').get(key);
    return row?this.authorize(projectId,String(row.canvas_id)):undefined;
  }
}

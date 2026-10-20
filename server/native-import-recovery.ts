import {join} from 'node:path';
import type {Store} from './store.js';
import {AppError} from './store.js';
import {NativeImports} from './native-imports.js';
import {inspectNativeImport} from './native-import-inspection.js';
import {forkNative,nativeForkGrowth,requireSessionRoom} from './native-session.js';
import type {PiModule} from './pi-adapter.js';
import type {StorageCapacity} from './storage.js';

/** Copy preparation only; caller must separately freeze and verify execution environment.
 * Run this in an owned worker, never in an HTTP handler. No extensions or model are loaded.
 */
export function forkImportedSession(pi:PiModule,store:Store,capacity:StorageCapacity,projectId:string,importId:string,expectedHash:string,entryId:string){
  return capacity.exclusive(()=>{
    const original=new NativeImports(store,capacity.dataDir).get(projectId,importId);
    if(original.revoked)throw new AppError(410,'导入已撤销');
    if(original.received!==original.bytes)throw new AppError(409,'原件尚未上传完整');
    if(!entryId)throw new AppError(400,'请选择恢复历史节点');
    const sessionDir=join(capacity.dataDir,'sessions',projectId);const path=join(sessionDir,`import-${original.id}.jsonl`);
    const preview=inspectNativeImport({root:capacity.dataDir,projectId,path});
    if(preview.sha256!==original.sha256||preview.sha256!==expectedHash)throw new AppError(409,'导入原件与确认的预览不一致');
    const cwd=join(capacity.dataDir,'workspaces',projectId);
    requireSessionRoom(capacity,nativeForkGrowth(preview));
    return forkNative(pi,path,{importId,sessionId:preview.sessionId,sha256:preview.sha256,entryId},projectId,cwd,sessionDir,capacity);
  });
}

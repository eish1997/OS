/** Durable import identities and canonical bytes, separate from live editor state. */
export interface CanvasImportReceipt { canvasId:string; operationId:string; createdAt:number }
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const prefix='workbench.canvas-import.v1.';
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function canvasImportKey(scene:Uint8Array,name:string,projectId:string|null):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',scene.slice().buffer);
  return prefix+JSON.stringify([projectId,name,Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')]);
}
export function readOrCreateCanvasImport(storage:StoragePort,key:string):CanvasImportReceipt{
  if(!key.startsWith(prefix)||key.length>2048)throw new Error('Invalid canvas import identity');
  const raw=storage.getItem(key);
  if(raw!==null){
    let value:CanvasImportReceipt;
    try{value=JSON.parse(raw) as CanvasImportReceipt;}catch{throw new Error('画板导入恢复记录损坏，原文档未修改');}
    if(!value||!uuid.test(value.canvasId)||!uuid.test(value.operationId)||!Number.isSafeInteger(value.createdAt))throw new Error('画板导入恢复记录无效，原文档未修改');
    return value;
  }
  const receipt={canvasId:crypto.randomUUID(),operationId:crypto.randomUUID(),createdAt:Date.now()};
  storage.setItem(key,JSON.stringify(receipt));
  return receipt;
}
export function completeCanvasImport(storage:StoragePort,key:string,receipt:CanvasImportReceipt){
  const current=storage.getItem(key);
  if(current===JSON.stringify(receipt))storage.removeItem(key);
}

interface PreparedImport { key:string; receipt:CanvasImportReceipt; scene:Uint8Array }
function openImportJournal():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('workbench-canvas-imports',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('pending',{keyPath:'key'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('导入恢复记录被其他页面占用，请关闭旧页面后重试'));
  });
}
/** Persist canonical bytes and operation identity in the same transaction. This
 * also preserves non-deterministic format conversions across a browser restart. */
export async function prepareCanvasImport(key:string,scene:Uint8Array):Promise<PreparedImport>{
  const db=await openImportJournal();
  try{return await new Promise<PreparedImport>((resolve,reject)=>{
    const tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending');let result:PreparedImport;
    const read=store.get(key);
    read.onsuccess=()=>{
      const existing=read.result as PreparedImport|undefined;
      try{
        const receipt=readOrCreateCanvasImport({getItem:()=>existing?JSON.stringify(existing.receipt):null,setItem:()=>{},removeItem:()=>{}},key);
        if(existing){
          if(!(existing.scene instanceof Uint8Array))throw new Error('画板导入暂存内容损坏');
          result={key,receipt,scene:existing.scene};
        }else{
          result={key,receipt,scene:scene.slice()};
          const count=store.count();count.onsuccess=()=>{if(count.result>=32){tx.abort();return;}store.put(result);};
        }
      }catch(error){reject(error);tx.abort();}
    };
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(tx.error??new Error('导入暂存未完成，请检查浏览器存储空间或处理已有导入'));
    tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}
export async function finishCanvasImport(prepared:PreparedImport):Promise<void>{
  const db=await openImportJournal();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('pending','readwrite'),store=tx.objectStore('pending'),read=store.get(prepared.key);
    read.onsuccess=()=>{if(read.result?.receipt.operationId===prepared.receipt.operationId)store.delete(prepared.key);};
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
}

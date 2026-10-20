import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasImportKey,readOrCreateCanvasImport,completeCanvasImport} from '../shared/canvas-import.js';

test('uncertain imports reuse durable identities, completion releases them, and project/content identities differ',async()=>{
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  const bytes=new Uint8Array([1,2,3]),key=await canvasImportKey(bytes,'Example',null);
  const first=readOrCreateCanvasImport(storage,key);
  assert.deepEqual(readOrCreateCanvasImport(storage,await canvasImportKey(bytes,'Example',null)),first);
  assert.notEqual(await canvasImportKey(bytes,'Example',crypto.randomUUID()),key);
  assert.notEqual(await canvasImportKey(new Uint8Array([1,2,4]),'Example',null),key);
  completeCanvasImport(storage,key,first);
  assert.notEqual(readOrCreateCanvasImport(storage,key).operationId,first.operationId);
  storage.setItem(key,'broken');assert.throws(()=>readOrCreateCanvasImport(storage,key),/损坏/);
});

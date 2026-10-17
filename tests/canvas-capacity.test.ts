import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageCapacity } from '../server/storage.js';

test('canvas scenes, databases and import staging share a measured group and whole-host budget',()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-capacity-'));
  mkdirSync(join(root,'canvas','scenes'),{recursive:true});mkdirSync(join(root,'canvas','staging'));
  writeFileSync(join(root,'canvas','scenes','scene.fig'),Buffer.alloc(100));
  writeFileSync(join(root,'canvas','workspace.sqlite'),Buffer.alloc(20));
  writeFileSync(join(root,'canvas','staging','package.part'),Buffer.alloc(30));
  const capacity=new StorageCapacity(root,{canvasBytes:160,minFreeBytes:0});
  assert.equal(capacity.usage().groups.canvas.bytes,150);
  assert.equal(capacity.usage().groups.canvas.files,3);
  capacity.assert('canvas',10);
  assert.throws(()=>capacity.assert('canvas',11),error=>(error as {status:number}).status===507);
  const shared=new StorageCapacity(root,{canvasBytes:1000,totalBytes:200,controlReserveBytes:20,minFreeBytes:0});
  assert.throws(()=>shared.assert('assets',31),error=>(error as {status:number}).status===507);
  shared.assert('database',30,true);
});

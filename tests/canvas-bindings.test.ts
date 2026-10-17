import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { CanvasBindings } from '../server/canvas-bindings.js';
import type { Project } from '../shared/contracts.js';

test('host canvas ownership survives interrupted creation and isolates projects and personal recents',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'canvas-bindings-')),'host.sqlite');let store=new Store(path);
  try{
    const a=store.create<Project>('project',{name:'A',description:'',archived:false});
    const b=store.create<Project>('project',{name:'B',description:'',archived:false});
    let bindings=new CanvasBindings(store);const canvas=randomUUID(),operation=randomUUID();
    bindings.prepare(a.id,canvas,operation);
    assert.throws(()=>bindings.authorize(a.id,canvas),{status:409});
    assert.throws(()=>bindings.prepare(b.id,canvas,operation),{status:403});
    store.db.close();store=new Store(path);bindings=new CanvasBindings(store);
    assert.equal(bindings.prepare(a.id,canvas,operation).state,'prepared');
    bindings.confirm(a.id,canvas,operation,2);bindings.confirm(a.id,canvas,operation,1);
    assert.equal(bindings.authorize(a.id,canvas).revision,2);
    assert.throws(()=>bindings.prepare(a.id,randomUUID(),operation),{status:409});
    assert.throws(()=>bindings.authorize(b.id,canvas),{status:403});
    assert.throws(()=>bindings.authorize(null,canvas),{status:403});
    bindings.opened(a.id,canvas);assert.equal(bindings.recent(a.id)?.canvasId,canvas);
    assert.equal(bindings.recent(b.id),undefined);assert.equal(bindings.recent(null),undefined);
    const personal=randomUUID(),personalOperation=randomUUID();bindings.prepare(null,personal,personalOperation);bindings.confirm(null,personal,personalOperation,1);bindings.opened(null,personal);
    assert.equal(bindings.recent(a.id)?.canvasId,canvas);assert.equal(bindings.list(null).length,1);
    store.update<Project>('project',a.id,a.revision,{archived:true});
    assert.throws(()=>bindings.authorize(a.id,canvas),{status:409});
    const directory=randomUUID();
    assert.equal(bindings.reserve(b.id,directory).operationId,directory);
    assert.throws(()=>bindings.reserve(null,directory),{status:403});
    const save=randomUUID();
    assert.equal(bindings.adoptReservation(b.id,directory,save).operationId,save);
    assert.throws(()=>bindings.adoptReservation(b.id,directory,randomUUID()),{status:409});
    bindings.confirm(b.id,directory,save,1);
    assert.equal(bindings.authorize(b.id,directory).state,'ready');
  }finally{store.db.close();}
});

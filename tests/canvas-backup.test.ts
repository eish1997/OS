import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.js';
import { backup, restore, verifyBackup } from '../server/backup.js';
import { CanvasBindings } from '../server/canvas-bindings.js';
import type { Project } from '../shared/contracts.js';

test('canvas scene and binding survive schema-2 backup restore; schema 1 still verifies',()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-backup-'));
  const source=join(root,'source');mkdirSync(source);
  const store=new Store(join(source,'workbench.sqlite'));
  try{
    const project=store.create<Project>('project',{name:'Backup A',description:'',archived:false});
    const canvasId=randomUUID();
    const bindings=new CanvasBindings(store);
    bindings.reserve(project.id,canvasId);
    bindings.confirm(project.id,canvasId,canvasId,1);
    const scene=Buffer.from('FIG_BACKUP_SCENE');
    const sceneHash=createHash('sha256').update(scene).digest('hex');
    const canvasDir=join(source,'canvas');mkdirSync(join(canvasDir,'scenes'),{recursive:true});
    writeFileSync(join(canvasDir,'scenes',`${sceneHash}.fig`),scene);
    const workspace=new DatabaseSync(join(canvasDir,'workspace.sqlite'));
    workspace.exec('CREATE TABLE docs(id TEXT PRIMARY KEY, revision INTEGER NOT NULL);');
    workspace.prepare('INSERT INTO docs VALUES(?,?)').run(canvasId,1);
    workspace.close();
    const mounts=new DatabaseSync(join(canvasDir,'mounts.sqlite'));
    mounts.exec('CREATE TABLE mounts(id TEXT PRIMARY KEY);');
    mounts.close();
    const pack=join(root,'pack');
    const manifest=backup(store,source,pack);
    assert.equal(manifest.schema,2);
    assert.equal(manifest.hasCanvas,true);
    assert(manifest.files.some(file=>file.path===`canvas/scenes/${sceneHash}.fig`));
    assert(manifest.files.some(file=>file.path==='canvas/workspace.sqlite'));
    assert(!manifest.files.some(file=>file.path.includes('service-owner')));
    verifyBackup(pack);
    const target=join(root,'restored');
    restore(pack,target);
    assert.equal(readFileSync(join(target,'canvas','scenes',`${sceneHash}.fig`)).toString(),'FIG_BACKUP_SCENE');
    const restored=new Store(join(target,'workbench.sqlite'));
    try{
      const binding=new CanvasBindings(restored).authorize(project.id,canvasId);
      assert.equal(binding.revision,1);
      assert.equal(binding.state,'ready');
    }finally{restored.close();}
    const legacy=join(root,'legacy');mkdirSync(legacy);
    writeFileSync(join(legacy,'workbench.sqlite'),readFileSync(join(pack,'workbench.sqlite')));
    writeFileSync(join(legacy,'manifest.json'),JSON.stringify({
      schema:1,sourceRoot:source,files:[{path:'workbench.sqlite',sha256:createHash('sha256').update(readFileSync(join(legacy,'workbench.sqlite'))).digest('hex')}]
    }));
    assert.equal(verifyBackup(legacy).schema,1);
    mkdirSync(join(root,'bad'));
    writeFileSync(join(root,'bad','workbench.sqlite'),readFileSync(join(pack,'workbench.sqlite')));
    writeFileSync(join(root,'bad','manifest.json'),JSON.stringify({
      schema:2,sourceRoot:source,files:[
        {path:'workbench.sqlite',sha256:createHash('sha256').update(readFileSync(join(root,'bad','workbench.sqlite'))).digest('hex')},
        {path:'canvas/evil.sqlite',sha256:'0'.repeat(64)}
      ]
    }));
    assert.throws(()=>verifyBackup(join(root,'bad')));
  }finally{store.close();}
});

test('feature-off leaves canvas files on disk after backup snapshot',()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-feature-off-'));
  const source=join(root,'source');mkdirSync(join(source,'canvas','scenes'),{recursive:true});
  const store=new Store(join(source,'workbench.sqlite'));
  try{
    writeFileSync(join(source,'canvas','scenes',`${'a'.repeat(64)}.fig`),'kept');
    const db=new DatabaseSync(join(source,'canvas','workspace.sqlite'));
    db.exec('CREATE TABLE t(x INTEGER);');db.close();
    const pack=join(root,'pack');backup(store,source,pack);
    assert(existsSync(join(source,'canvas','workspace.sqlite')));
    assert(existsSync(join(source,'canvas','scenes',`${'a'.repeat(64)}.fig`)));
    assert.equal(verifyBackup(pack).schema,2);
  }finally{store.close();}
});

test('backup snapshots canvas while the managed service is ready',async()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-live-backup-'));
  const source=join(root,'source');
  const {CanvasService}=await import('../server/canvas-service.js');
  const service=new CanvasService({entry:join(process.cwd(),'apps/canvas/local/desktop-entry.mjs'),directory:join(source,'canvas'),origin:'http://private.invalid'});
  const store=new Store(join(source,'workbench.sqlite'));
  try{
    await service.start();
    const scene=Buffer.from('LIVE_SCENE');
    const sceneHash=createHash('sha256').update(scene).digest('hex');
    mkdirSync(join(source,'canvas','scenes'),{recursive:true});
    writeFileSync(join(source,'canvas','scenes',`${sceneHash}.fig`),scene);
    const pack=join(root,'pack');
    const manifest=backup(store,source,pack);
    assert.equal(manifest.schema,2);
    assert(manifest.files.some(file=>file.path===`canvas/scenes/${sceneHash}.fig`));
    assert(manifest.files.some(file=>file.path==='canvas/workspace.sqlite'));
    verifyBackup(pack);
  }finally{await service.dispose();store.close();}
});

test('backup during live canvas write and directory observation remains restorable',{timeout:30000},async()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-live-observe-'));
  const source=join(root,'source');
  const external=mkdtempSync(join(tmpdir(),'canvas-observe-ext-'));
  writeFileSync(join(external,'note.txt'),'observe');
  const {CanvasService}=await import('../server/canvas-service.js');
  const {setTimeout:delay}=await import('node:timers/promises');
  const service=new CanvasService({entry:join(process.cwd(),'apps/canvas/local/desktop-entry.mjs'),directory:join(source,'canvas'),origin:'http://private.invalid'});
  const store=new Store(join(source,'workbench.sqlite'));
  try{
    const transport=await service.start();
    const canvasId=randomUUID();
    const scene=Buffer.from('LIVE_EDIT_SCENE');
    const first=await transport.json(`/canvases/${canvasId}`,'POST',JSON.stringify({
      operationId:randomUUID(),expectedRevision:0,sceneBase64:scene.toString('base64'),metadata:{formatVersion:1}
    }));
    assert.equal(first.status,200);
    const mount=await transport.json('/mounts','POST',JSON.stringify({path:external}));
    assert.equal(mount.status,200);
    writeFileSync(join(external,'note-2.txt'),'changed');
    const nextScene=Buffer.from('LIVE_EDIT_SCENE_V2');
    const write=transport.json(`/canvases/${canvasId}`,'POST',JSON.stringify({
      operationId:randomUUID(),expectedRevision:1,sceneBase64:nextScene.toString('base64'),metadata:{formatVersion:1}
    }));
    const poll=transport.json(`/mounts/${mount.data.id}/poll`,'POST','{}');
    await delay(5);
    const pack=join(root,'pack');
    let manifest;
    try{manifest=backup(store,source,pack);}
    catch(error){
      assert.equal((error as {status?:number}).status,409);
      await Promise.all([write,poll]);
      manifest=backup(store,source,pack);
    }
    const [written,polled]=await Promise.all([write,poll]);
    assert.equal(written.status,200);
    assert.equal(polled.status,200);
    assert.equal(manifest.schema,2);
    verifyBackup(pack);
    const target=join(root,'restored');
    restore(pack,target);
    assert(existsSync(join(target,'canvas','workspace.sqlite')));
    const restored=new DatabaseSync(join(target,'canvas','workspace.sqlite'),{readOnly:true});
    try{
      const row=restored.prepare('SELECT revision FROM heads WHERE canvas_id=?').get(canvasId) as {revision:number};
      assert.equal(row.revision,written.data.revision??2);
    }finally{restored.close();}
  }finally{await service.dispose();store.close();}
});

test('verifyBackup rejects unknown schema 3',()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-schema3-'));
  writeFileSync(join(root,'workbench.sqlite'),Buffer.alloc(0));
  writeFileSync(join(root,'manifest.json'),JSON.stringify({
    schema:3,sourceRoot:root,files:[{path:'workbench.sqlite',sha256:createHash('sha256').update(Buffer.alloc(0)).digest('hex')}]
  }));
  assert.throws(()=>verifyBackup(root),error=>(error as {status?:number}).status===400||/备份版本|无效/.test(String(error)));
});

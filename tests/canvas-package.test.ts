import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { loadCanvasPackage } from '../server/canvas-package.js';

test('resource manifest checks required resources, digest and containment before service execution',()=>{
  const root=mkdtempSync(join(tmpdir(),'canvas-manifest-'));
  const files=['ui/index.html','ui/canvaskit.wasm','service/workspace.mjs'].map(path=>{
    mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),'fixture');
    return {path,bytes:7,sha256:createHash('sha256').update('fixture').digest('hex')};
  });
  const manifest={formatVersion:1,kind:'workbench-canvas',ui:'ui',service:'service/workspace.mjs',files};
  const save=()=>writeFileSync(join(root,'manifest.json'),JSON.stringify(manifest));save();
  assert.equal(loadCanvasPackage(root).entry,join(root,'service/workspace.mjs'));
  writeFileSync(join(root,'service/workspace.mjs'),'changed');
  assert.throws(()=>loadCanvasPackage(root),/checksum/);
  writeFileSync(join(root,'service/workspace.mjs'),'fixture');
  manifest.files=[...files,{...files[0],path:'../outside'}];save();
  assert.throws(()=>loadCanvasPackage(root),/manifest/);
  manifest.files=files.slice(0,2);save();assert.throws(()=>loadCanvasPackage(root),/incomplete/);
});

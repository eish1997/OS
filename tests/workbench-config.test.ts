import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { WorkbenchConfigurations } from '../server/workbench-config.js';
import { defaultLayout, addWorkspace, addWindow, createWindow } from '../shared/workbench-layout.js';
import { defaultAppearance } from '../shared/workbench-appearance.js';
test('configuration is durable, revision guarded, corruption recovers without overwriting original',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'wb-layout-')),'state.sqlite');let store=new Store(path);let configs=new WorkbenchConfigurations(store);
  const a=configs.read(),b=configs.read();const saved=configs.save(a.revision,a.layout);assert.equal(saved.revision,1);
  assert.throws(()=>configs.save(b.revision,b.layout),/另一个页面/);
  const changed=addWorkspace(saved.layout,'日常空间');changed.appearance={...defaultAppearance,theme:'light',lineWidth:2.5};configs.save(1,changed);store.close();
  store=new Store(path);configs=new WorkbenchConfigurations(store);assert.equal(configs.read().layout.workspaces.length,2);
  assert.deepEqual(configs.read().layout.appearance,changed.appearance);
  const raw=store.get<any>('workbench_config','workbench-layout-v1');store.update('workbench_config',raw.id,raw.revision,{layout:{schemaVersion:99}} as any);
  const recovered=configs.read();assert.ok(recovered.recovery);assert.equal(recovered.layout.workspaces.length,1);
  assert.equal(store.get<any>('workbench_config',raw.id).layout.schemaVersion,99);store.close();
});
test('config rejects malformed graphs and bindings without mutating saved layout',()=>{
  const store=new Store(join(mkdtempSync(join(tmpdir(),'wb-layout-')),'state.sqlite'));const configs=new WorkbenchConfigurations(store);
  const l=defaultLayout();configs.save(0,l);
  assert.throws(()=>configs.save(1,{...l,schemaVersion:2}));
  assert.throws(()=>configs.save(1,addWindow(l,createWindow('chat','invalid','missing'))));
  assert.equal(configs.read().revision,1);store.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { PluginState } from '../server/plugin-state.js';
import { inspectPlugin } from '../server/plugin-packages.js';
import { Plugins } from '../server/plugins.js';
import { backup, restore } from '../server/backup.js';
import { StorageCapacity } from '../server/storage.js';

test('a second coordinator leaves a live lease owner operation and configuration intact', async () => {
  const root=mkdtempSync(join(tmpdir(),'plugin live owner '));const database=join(root,'data','workbench.sqlite');
  const store=new Store(database);let observer:Store|undefined;let plugins:Plugins|undefined;
  try {
    const state=new PluginState(store);const source=join(root,'source');mkdirSync(source);
    const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'live-owner-install-001',trusted:true});
    assert(store.lease('scheduler','live-owner',30000));state.phase(op.id,'applying','live installation');
    const revision=state.configuration().revision;
    observer=new Store(database);plugins=new Plugins(observer);plugins.tick();
    assert.equal(state.operations()[0].phase,'applying');assert.equal(state.configuration().revision,revision);
    assert.equal(state.configuration().health,'ready');assert.equal(plugins.mutating,false);
    store.release('scheduler','live-owner');plugins.tick();
    assert.equal(state.operations()[0].phase,'reconcile_required');assert.equal(state.configuration().health,'reconcile_required');
  } finally {await plugins?.stop();observer?.close();store.close();rmSync(root,{recursive:true,force:true});}
});

test('backup restore retains declarations but never enables or replays original plugin paths', async () => {
  const root=mkdtempSync(join(tmpdir(),'plugin restore '));const data=join(root,'data');const source=join(root,'source');mkdirSync(source);
  writeFileSync(join(source,'extension.js'),'exports.default=()=>{}');
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'restore-probe',pi:{extensions:['extension.js']}}));
  const store=new Store(join(data,'workbench.sqlite'));let restored:Store|undefined;
  try{
    const state=new PluginState(store);const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'restore-install-001',trusted:true});
    const pkg=await inspectPlugin(source,join(data,'plugins'));state.phase(op.id,'committing','fixture inspection');state.commit(op.id,[pkg]);state.configure(state.configuration().revision,pkg.id,true);
    const pending=state.enqueue({action:'update',source,revision:state.configuration().revision,commandId:'restore-update-001',trusted:true});
    backup(store,data,join(root,'backup'));const target=join(root,'restored');restore(join(root,'backup'),target);
    restored=new Store(join(target,'workbench.sqlite'));const state2=new PluginState(restored);
    assert.equal(state2.configuration().packages[0].enabled,false);assert.equal(state2.configuration().packages[0].installationState,'missing');
    assert.throws(()=>state2.configure(state2.configuration().revision,pkg.id,true),/文件缺失/);
    assert.equal(state2.manifest().packages.length,0);assert.equal(state2.operations().find(o=>o.id===pending.id)?.phase,'failed');
    assert.equal(existsSync(join(target,'plugins')),false);assert(existsSync(source));
  }finally{restored?.close();store.close();rmSync(root,{recursive:true,force:true});}
});

test('restart quarantines unfinished file mutation and capacity accounts for plugin/cache bytes', async () => {
  const root=mkdtempSync(join(tmpdir(),'plugin interrupted '));const store=new Store(join(root,'data','workbench.sqlite'));
  let plugins:Plugins|undefined;
  try{
    const state=new PluginState(store);const source=join(root,'source');mkdirSync(source);
    const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'interrupted-install-001',trusted:true});state.phase(op.id,'applying','files changed');
    const directory=join(root,'data','plugins','cache');mkdirSync(directory,{recursive:true});writeFileSync(join(directory,'partial.tgz'),Buffer.alloc(8192));
    plugins=new Plugins(store);assert.equal(state.configuration().health,'reconcile_required');assert.equal(state.operations()[0].phase,'reconcile_required');assert.throws(()=>state.manifest(),/需要修复/);
    const capacity=new StorageCapacity(join(root,'data'),{pluginsBytes:4096,minFreeBytes:0});assert.equal(capacity.usage().groups.plugins.bytes,8192);assert.throws(()=>capacity.assert('plugins',0),/plugins/);
  }finally{await plugins?.stop();store.close();rmSync(root,{recursive:true,force:true});}
});

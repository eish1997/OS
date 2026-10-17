import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { Plugins } from '../server/plugins.js';
import { workbenchResources, loadPi } from '../server/pi-adapter.js';

test('missing local source cannot load and can be unregistered then relocated without deletion', {timeout:30000}, async()=>{
  const root=mkdtempSync(join(tmpdir(),'plugin relocate '));const source=join(root,'source');const relocated=join(root,'relocated');mkdirSync(source);
  writeFileSync(join(source,'package.json'),JSON.stringify({name:'relocation-probe',pi:{extensions:['tool.mjs']}}));writeFileSync(join(source,'tool.mjs'),'export default ()=>{}');
  const store=new Store(join(root,'data','workbench.sqlite'));const plugins=new Plugins(store);const state=plugins.state;
  const operate=async(action:'install'|'remove',path:string,key:string)=>{
    const op=state.enqueue({action,source:path,revision:state.configuration().revision,commandId:key,trusted:true});plugins.tick();
    const deadline=Date.now()+12000;while(state.pending().length&&Date.now()<deadline)await delay(50);
    assert.equal(state.operations().find(o=>o.id===op.id)?.phase,'completed');
  };
  try{
    await operate('install',source,'relocate-install-001');const old=state.configuration().packages[0];state.configure(state.configuration().revision,old.id,true);
    renameSync(source,relocated);assert.equal(state.snapshot().configuration.packages[0].installationState,'missing');
    assert.throws(()=>state.manifest());assert.throws(()=>state.configure(state.configuration().revision,old.id,true),/文件缺失/);
    await operate('remove',source,'relocate-remove-001');assert(existsSync(join(relocated,'tool.mjs')));
    await operate('install',relocated,'relocate-install-002');const next=state.configuration().packages[0];assert.notEqual(next.id,old.id);assert.equal(next.enabled,false);
    state.configure(state.configuration().revision,next.id,true);assert.equal(state.manifest().packages[0].id,next.id);
  }finally{await plugins.stop();store.close();rmSync(root,{recursive:true,force:true});}
});

test('failed launch persistence reaps the child before releasing the environment', { timeout: 15000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin launch failure '));
  const source = join(root, 'source'); mkdirSync(source);
  const store = new Store(join(root, 'data', 'workbench.sqlite')); const plugins = new Plugins(store);
  try {
    const state = plugins.state;
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'launch-failure-001', trusted: true });
    const phase = state.phase.bind(state);
    state.phase = (...args) => {
      if (args[1] === 'applying') throw new Error('injected persistence failure');
      return phase(...args);
    };
    plugins.tick();
    assert.equal(plugins.mutating, true);
    assert.equal(plugins.gate.acquireRead('must-wait'), false);
    await plugins.stop();
    assert.equal(plugins.mutating, false);
    assert.equal(plugins.gate.status().writer, undefined);
    assert.equal(state.operations().find(o => o.id === op.id)?.phase, 'reconcile_required');
    assert.throws(() => state.manifest(), /需要修复/);
    assert(existsSync(source));
  } finally { await plugins.stop(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('real manager worker installs local package, waits for reader, loads resources and removes registration', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin manager '));
  const source = join(root, 'local source'); mkdirSync(source);
  writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'manager-probe', pi: { extensions: ['tool.mjs'], skills: ['skills'] } }));
  writeFileSync(join(source, 'tool.mjs'), 'export default ()=>{}');
  mkdirSync(join(source, 'skills', 'probe'), { recursive: true }); writeFileSync(join(source, 'skills', 'probe', 'SKILL.md'), '---\nname: manager-probe\ndescription: Probe skill\n---\nInstructions');
  const store = new Store(join(root, 'data', 'workbench.sqlite')); const plugins = new Plugins(store);
  const state = plugins.state;
  const wait = async (id: string) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const op = state.operations().find(o => o.id === id)!;
      if (['completed', 'failed', 'reconcile_required'].includes(op.phase)) return op;
      await delay(50);
    }
    throw new Error('Observed plugin operation did not finish within test bound');
  };
  try {
    const op = state.enqueue({ action: 'install', source, revision: state.configuration().revision, commandId: 'manager-install-001', trusted: true });
    assert(plugins.gate.acquireRead('existing-run')); plugins.tick();
    assert.equal(state.operations()[0].phase, 'waiting_for_environment');
    assert.equal(plugins.gate.acquireRead('new-run'), false);
    plugins.gate.releaseRead('existing-run'); plugins.tick();
    const result = await wait(op.id); assert.equal(result.phase, 'completed', result.error ?? '安装应成功');
    const pkg = state.configuration().packages[0]; assert.equal(pkg.enabled, false);
    state.configure(state.configuration().revision, pkg.id, true);
    const manifest = state.manifest();
    const agentDir = join(root, 'session-agent'); mkdirSync(agentDir);
    const resources = await workbenchResources(await loadPi(), root, agentDir, '', {
      extensions: manifest.resources.filter(r => r.kind === 'extensions').map(r => r.path),
      skills: manifest.resources.filter(r => r.kind === 'skills').map(r => r.path)
    });
    assert.equal(resources.loader.getExtensions().extensions.length, 1);
    assert(resources.loader.getSkills().skills.some(s => s.name === 'manager-probe'));
    const removal = state.enqueue({ action: 'remove', source, revision: state.configuration().revision, commandId: 'manager-remove-001', trusted: false }); plugins.tick();
    assert.equal((await wait(removal.id)).phase, 'completed');
    assert.equal(state.configuration().packages.length, 0); assert(existsSync(source));
  } finally { await plugins.stop(); store.close(); rmSync(root, { recursive: true, force: true }); }
});

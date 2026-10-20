import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { Plugins } from '../server/plugins.js';
import { StorageCapacity } from '../server/storage.js';
import { backup, restore } from '../server/backup.js';

/** Minimal ustar fixture: all package bytes are authored here, no third-party code. */
function packageTar(version: string, slow: boolean | 'oversize' = false) {
  const files = {
    'package/package.json': JSON.stringify({ name: 'workbench-plugin-npm-probe', version, scripts: { postinstall: 'node install.cjs' }, pi: { extensions: ['tool.js'] } }),
    'package/tool.js': 'exports.default = function(){};',
    'package/install.cjs': slow === 'oversize' ? "require('node:fs').writeFileSync('oversized.bin',Buffer.alloc(20*1024*1024));setTimeout(()=>{},60000)" : slow ? 'setTimeout(()=>{},60000)' : `require('node:fs').writeFileSync('installed-marker.txt',${JSON.stringify(version)})`
  };
  const records: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const bytes = Buffer.from(content); const header = Buffer.alloc(512);
    header.write(name); header.write('0000644\0',100); header.write('0000000\0',108); header.write('0000000\0',116);
    header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124); header.write('00000000000\0',136); header.fill(32,148,156); header.write('0',156); header.write('ustar\0',257); header.write('00',263);
    const sum = header.reduce((total, value) => total + value, 0); header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
    records.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...records, Buffer.alloc(1024)]));
}

test('real npm installs, updates, handles timeout and capacity interruption, repairs and reinstalls a clean restore', { timeout: 100000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'plugin npm ')); const store = new Store(join(root, 'data', 'workbench.sqlite'));
  const packs = new Map([['1.0.0',packageTar('1.0.0')],['1.1.0',packageTar('1.1.0')],['2.0.0',packageTar('2.0.0',true)],['3.0.0',packageTar('3.0.0','oversize')]]);
  let base = ''; let requests = 0;
  const registry = createServer((req,res) => {
    requests++;
    const version = req.url?.match(/^\/package-(.+)\.tgz$/)?.[1];
    if (version && packs.has(version)) { res.setHeader('content-type','application/octet-stream');res.end(packs.get(version));return; }
    res.setHeader('content-type','application/json');
    if (req.url?.startsWith('/workbench-plugin-npm-probe')) {
      res.end(JSON.stringify({name:'workbench-plugin-npm-probe','dist-tags':{latest:'1.1.0'},versions:Object.fromEntries([...packs].map(([v,bytes])=>[v,{name:'workbench-plugin-npm-probe',version:v,scripts:{postinstall:'node install.cjs'},dist:{tarball:`${base}/package-${v}.tgz`,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')}}]))}));
    } else { res.statusCode=404;res.end('{}'); }
  });
  await new Promise<void>(done=>registry.listen(0,'127.0.0.1',done)); base=`http://127.0.0.1:${(registry.address() as {port:number}).port}`;
  const plugins = new Plugins(store,()=>false,undefined,{registry:base,timeoutMs:18000});
  const state=plugins.state;
  async function operate(action:'install'|'update'|'remove'|'repair',version:string) {
    const source=action==='install'?`npm install workbench-plugin-npm-probe@${version}`:`npm:workbench-plugin-npm-probe@${version}`;
    const op=state.enqueue({action,source,revision:state.configuration().revision,commandId:`npm-${action}-${version.replaceAll('.','-')}`,trusted:true});
    assert.equal(op.source,`npm:workbench-plugin-npm-probe@${version}`);plugins.tick();
    const deadline=Date.now()+25000;
    while(Date.now()<deadline){const current=state.operations().find(o=>o.id===op.id)!;if(['completed','failed','reconcile_required'].includes(current.phase))return current;await delay(100);}
    throw new Error('npm operation observation exceeded deadline');
  }
  try {
    const install=await operate('install','1.0.0');assert.equal(install.phase,'completed',install.error??'npm install');
    const pkg=state.configuration().packages[0];assert.equal(pkg.enabled,false);
    assert.equal(readFileSync(join(pkg.root,'installed-marker.txt'),'utf8'),'1.0.0');
    assert.equal(pkg.lockedSource,'npm:workbench-plugin-npm-probe@1.0.0');
    const update=await operate('update','1.1.0');assert.equal(update.phase,'completed',update.error??'npm update');
    assert.equal(state.configuration().packages[0].version,'1.1.0');
    const remove=await operate('remove','1.1.0');assert.equal(remove.phase,'completed',remove.error??'npm remove');assert.equal(existsSync(pkg.root),false);
    const interrupted=await operate('install','2.0.0');assert.equal(interrupted.phase,'reconcile_required');assert.equal(state.configuration().health,'reconcile_required');assert.throws(()=>state.manifest(),/需要修复/);
    const capacity=new StorageCapacity(join(root,'data'),{pluginsBytes:18*1024**2,minFreeBytes:0});store.attachCapacity(capacity);
    const oversized=await operate('repair','3.0.0');assert.equal(oversized.phase,'reconcile_required');assert.match(oversized.error??'',/容量/);
    assert(existsSync(join(plugins.agentDir,'npm','node_modules','workbench-plugin-npm-probe','oversized.bin')),'actual install script must exceed quota');
    assert.throws(()=>state.manifest(),/需要修复/);
    // Increase the explicit quota to admit repair. Reinstallation removes the
    // incomplete package; never delete arbitrary source or user directories.
    capacity.limits.pluginsBytes=64*1024**2;
    const repaired=await operate('repair','1.0.0');assert.equal(repaired.phase,'completed',repaired.error??'repair should complete');
    assert.equal(state.configuration().health,'ready');assert.equal(state.configuration().packages[0].version,'1.0.0');
    assert.equal(existsSync(join(state.configuration().packages[0].root,'oversized.bin')),false);
    const saved=join(root,'backup');backup(store,join(root,'data'),saved);const restoredRoot=join(root,'restored');restore(saved,restoredRoot);
    const restoredStore=new Store(join(restoredRoot,'workbench.sqlite'));const restoredPlugins=new Plugins(restoredStore,()=>false,undefined,{registry:base,timeoutMs:18000});
    try {
      const restoredState=restoredPlugins.state;const restoredPkg=restoredState.configuration().packages[0];
      assert.equal(restoredPkg.enabled,false);assert.equal(restoredPkg.installationState,'missing');assert.equal(existsSync(restoredPkg.root),false);
      const requestsBefore=requests;restoredState.manifest();await delay(100);assert.equal(requests,requestsBefore,'restore and runtime inspection must not contact registry');
      const op=restoredState.enqueue({action:'repair',source:restoredPkg.source,revision:restoredState.configuration().revision,commandId:'restore-reinstall-001',trusted:true});restoredPlugins.tick();
      const deadline=Date.now()+20000;while(Date.now()<deadline&&restoredState.operations().find(o=>o.id===op.id)?.phase!=='completed')await delay(100);
      assert.equal(restoredState.operations().find(o=>o.id===op.id)?.phase,'completed');assert.equal(restoredState.configuration().packages[0].enabled,false);
      restoredState.configure(restoredState.configuration().revision,restoredPkg.id,true);assert.equal(restoredState.manifest().packages[0].version,'1.0.0');
    }finally{await restoredPlugins.stop();restoredStore.close();}
    assert(requests>=4);
  } finally { await plugins.stop();await new Promise<void>(done=>registry.close(()=>done()));store.close();rmSync(root,{recursive:true,force:true}); }
});

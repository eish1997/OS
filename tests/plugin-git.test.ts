import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { Plugins } from '../server/plugins.js';

test('real Git transport installs pinned commit and uninstall preserves authored source', {timeout:45000}, async () => {
  const root=mkdtempSync(join(tmpdir(),'plugin git '));const repo=join(root,'repo');mkdirSync(repo);
  const git=(...args:string[])=>execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true,timeout:10000,stdio:['ignore','pipe','pipe']});
  git('init');writeFileSync(join(repo,'package.json'),JSON.stringify({name:'git-probe',version:'1.0.0',type:'module',pi:{extensions:['tool.js']}}));writeFileSync(join(repo,'tool.js'),'export default ()=>{};');git('add','.');git('-c','user.name=Local Test','-c','user.email=test@example.invalid','commit','-m','Local fixture');
  const commit=git('rev-parse','HEAD').trim();const www=join(root,'www');mkdirSync(join(www,'group'),{recursive:true});
  git('clone','--bare',repo,join(www,'group','probe.git'));git('--git-dir',join(www,'group','probe.git'),'update-server-info');
  const server=createServer((req,res)=>{try{const path=resolve(www,'.'+new URL(req.url!,'http://localhost').pathname);const rel=relative(www,path);if(rel.startsWith('..')||isAbsolute(rel))throw new Error('outside');res.end(readFileSync(path));}catch{res.statusCode=404;res.end();}});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const source=`http://127.0.0.1:${(server.address() as {port:number}).port}/group/probe.git@${commit}`;
  const store=new Store(join(root,'data','workbench.sqlite'));const plugins=new Plugins(store);const state=plugins.state;
  async function wait(id:string){const deadline=Date.now()+25000;while(Date.now()<deadline){const op=state.operations().find(o=>o.id===id)!;if(['completed','failed','reconcile_required'].includes(op.phase))return op;await delay(100);}throw new Error('Git operation exceeded observation bound');}
  try{
    const op=state.enqueue({action:'install',source,revision:state.configuration().revision,commandId:'git-install-001',trusted:true});plugins.tick();const result=await wait(op.id);assert.equal(result.phase,'completed',result.error??'git install');
    const pkg=state.configuration().packages[0];assert.equal(pkg.commit,commit);assert.equal(pkg.resources.length,1);assert(pkg.lockedSource?.startsWith('http://127.0.0.1:'));
    const conflicting = source.replace(/:\d+\//, ':1/');
    const conflict = state.enqueue({action:'install',source:conflicting,revision:state.configuration().revision,commandId:'git-conflict-001',trusted:true});plugins.tick();
    assert.equal((await wait(conflict.id)).phase,'failed');
    assert.match(state.operations().find(o=>o.id===conflict.id)!.error!,/重叠/);
    assert.equal(state.configuration().health,'ready');
    assert.equal(state.configuration().packages[0].commit,commit);
    assert.equal(readFileSync(join(pkg.root,'tool.js'),'utf8'),'export default ()=>{};');
    const remove=state.enqueue({action:'remove',source,revision:state.configuration().revision,commandId:'git-remove-001',trusted:false});plugins.tick();assert.equal((await wait(remove.id)).phase,'completed');assert.equal(readFileSync(join(repo,'tool.js'),'utf8'),'export default ()=>{};');
  }finally{await plugins.stop();await new Promise<void>(done=>server.close(()=>done()));store.close();rmSync(root,{recursive:true,force:true});}
});

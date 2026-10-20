import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { Plugins } from '../server/plugins.js';
import { pluginOutputDiagnostic } from '../server/plugin-diagnostics.js';

test('offline npm source reports a safe network category and never enables a partial install', {timeout:30000}, async()=>{
  const root=mkdtempSync(join(tmpdir(),'plugin offline '));const store=new Store(join(root,'data','workbench.sqlite'));
  const plugins=new Plugins(store,undefined,undefined,{registry:'http://127.0.0.1:1',timeoutMs:22000});
  try{
    const state=plugins.state;const op=state.enqueue({action:'install',source:'npm:workbench-offline-probe',revision:state.configuration().revision,commandId:'offline-install-001',trusted:true});plugins.tick();
    const deadline=Date.now()+25000;while(Date.now()<deadline&&state.pending().length)await delay(100);
    const result=state.operations().find(o=>o.id===op.id)!;
    assert.equal(result.phase,'reconcile_required');assert.match(result.error??'',/无法连接插件来源/);
    assert.equal(state.configuration().packages.length,0);assert.throws(()=>state.manifest(),/需要修复/);
  }finally{await plugins.stop();store.close();rmSync(root,{recursive:true,force:true});}
});

test('diagnostics keep known categories without preserving raw output or tokens',()=>{
  assert.match(pluginOutputDiagnostic('npm error code ETARGET token=do-not-store')!,/版本不存在/);
  assert.match(pluginOutputDiagnostic('fatal: repository https://credential@example.invalid/private not found')!,/来源或指定版本不存在/);
  assert(!pluginOutputDiagnostic('ENOTFOUND https://secret@example.invalid')!.includes('secret'));
  assert.equal(pluginOutputDiagnostic('unknown provider output token=secret'),undefined);
});

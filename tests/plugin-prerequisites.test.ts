import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertPluginPrerequisites } from '../server/plugin-prerequisites.js';

for(const [source,tool] of [['npm:missing-probe','npm'],['https://example.invalid/group/probe.git','git']]) {
  test(`real plugin worker refuses missing ${tool} before creating an install directory`, {timeout:10000}, async()=>{
    const root=mkdtempSync(join(tmpdir(),'plugin missing tool '));const agentDir=join(root,'plugins');
    const child=fork(resolve('server/plugin-worker.ts'),[],{execArgv:['--import','tsx'],env:{...process.env,PATH:''},stdio:['ignore','ignore','ignore','ipc']});
    try{
      const message=once(child,'message');const closed=once(child,'close');
      child.send({operation:{action:'install',source},agentDir,packages:[]});
      const [result]=await message;await closed;
      assert.equal(result.type,'error');assert.equal(result.unchanged,true);assert.match(result.error,new RegExp('缺少 '+tool));
      assert.equal(existsSync(agentDir),false);
    }finally{if(child.exitCode===null&&child.signalCode===null){const closed=once(child,'close');child.kill();await closed;}rmSync(root,{recursive:true,force:true});}
  });
}
test('local plugin registration does not require npm or Git',()=>{
  assert.doesNotThrow(()=>assertPluginPrerequisites(resolve('local-source'),{PATH:''}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Store } from '../server/store.js';
import { Plugins } from '../server/plugins.js';

for (const [action,boundary] of [['install','preparing'],['install','committing'],['install','completed'],['update','committing'],['remove','committing']]) {
  test(`actual host death during ${action} at ${boundary} preserves a recoverable plugin operation`, { timeout: 50000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'plugin crash '));
    const source = join(root, 'source'); mkdirSync(source);
    writeFileSync(join(source, 'package.json'), JSON.stringify({name:'crash-probe',pi:{extensions:['tool.mjs']}}));
    writeFileSync(join(source, 'tool.mjs'), 'export default ()=>{}');
    const database = join(root, 'data', 'workbench.sqlite'); const marker = join(root, 'checkpoint.json');
    const child = fork(resolve('tests/fixtures/plugin-crash-host.ts'), [database, source, boundary, marker, '', action], {execArgv:['--import','tsx'],stdio:'ignore'});
    let store: Store | undefined; let plugins: Plugins | undefined;
    try {
      const deadline = Date.now() + 20000;
      while (!existsSync(marker) && Date.now() < deadline && child.exitCode === null) await delay(50);
      assert(existsSync(marker), `host must reach ${boundary}`);
      const operationId=JSON.parse(readFileSync(marker,'utf8')).operationId;
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      store = new Store(database); plugins = new Plugins(store);
      const state = plugins.state;
      const operation=()=>state.operations().find(op=>op.id===operationId)!;
      if (boundary === 'completed') {
        assert.equal(operation().phase, 'completed');
        assert.equal(state.configuration().packages.length, 1);
        assert.equal(state.configuration().health, 'ready');
        assert.equal(state.pending().length, 0);
      } else {
        assert.equal(operation().phase, boundary);
        plugins.tick(); assert.equal(operation().phase, boundary);
        assert.throws(() => state.enqueue({action:'repair',source,trusted:true,revision:state.configuration().revision,commandId:'premature-repair-001'}), /已有插件操作/);
        const recoveryDeadline = Date.now() + 32000;
        while (operation().phase !== 'reconcile_required' && Date.now() < recoveryDeadline) { plugins.tick(); await delay(100); }
        assert.equal(operation().phase, 'reconcile_required');
        assert.throws(() => state.manifest(), /需要修复/);
        // Repair starts only after the old host's durable lease has expired.
        const repair = state.enqueue({action:'repair',source,trusted:true,revision:state.configuration().revision,commandId:'crash-repair-001'});
        const repairDeadline = Date.now() + 35000;
        while (Date.now() < repairDeadline) {
          plugins.tick();
          if (state.operations().find(op=>op.id===repair.id)?.phase === 'completed') break;
          await delay(100);
        }
        assert.equal(state.operations().find(op=>op.id===repair.id)?.phase, 'completed');
        assert.equal(state.configuration().health, 'ready');
        assert.equal(state.configuration().packages.length, 1);
      }
      assert(existsSync(join(source, 'tool.mjs')));
    } finally {
      if (child.exitCode === null && child.signalCode === null) { const exited = once(child,'exit'); child.kill('SIGKILL'); await exited; }
      await plugins?.stop(); store?.close(); rmSync(root,{recursive:true,force:true});
    }
  });
}

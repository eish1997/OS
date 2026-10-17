import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('canvas activation is opt-in and enabled configuration requires an explicit package', () => {
  const cwd=mkdtempSync(join(tmpdir(),'canvas-config-'));
  const script=`import {config} from ${JSON.stringify(pathToFileURL(resolve('server/config.ts')).href)};console.log(JSON.stringify({package:config.canvasPackageDir??null}))`;
  const run=(enabled:string|undefined,packageDir='')=>{
    const env:NodeJS.ProcessEnv={...process.env,CANVAS_PACKAGE_DIR:packageDir};
    delete env.CANVAS_ENABLED;
    if(enabled!==undefined)env.CANVAS_ENABLED=enabled;
    return spawnSync(process.execPath,['--import',pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href,'--input-type=module','-e',script],{cwd,env,encoding:'utf8',windowsHide:true});
  };
  const disabled=run(undefined,'unused-package');assert.equal(disabled.status,0,disabled.stderr);assert.equal(JSON.parse(disabled.stdout).package,null);
  assert.notEqual(run('true').status,0);
  assert.notEqual(run('1').status,0);
  const enabled=run('1','bundle');assert.equal(enabled.status,0,enabled.stderr);assert.equal(JSON.parse(enabled.stdout).package,join(cwd,'bundle'));
});

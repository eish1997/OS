import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPi} from '../server/pi-adapter.js';
import {scanNative} from '../server/native-inspection.js';

test('pinned Pi 1.0.3 fixture reopens unchanged and matches the read-only scan',async()=>{
  const fixtureDir=join('tests','fixtures','pi-1.0.3');
  const name=readdirSync(fixtureDir).find(file=>file.endsWith('.jsonl'));
  assert.ok(name);
  const original=readFileSync(join(fixtureDir,name));
  const root=mkdtempSync(join(tmpdir(),'pi-original-'));const projectId='fixture-project';const dir=join(root,'sessions',projectId);mkdirSync(dir,{recursive:true});
  const path=join(dir,name);copyFileSync(join(fixtureDir,name),path);
  const pi=await loadPi();const manager=pi.SessionManager.open(path);
  const context=JSON.stringify(manager.buildSessionContext().messages);
  assert.match(context,/ORIGINAL_USER/);assert.match(context,/SIBLING/);
  const scanned=scanNative({path,sessionId:manager.getSessionId(),root,projectId});
  assert.equal(scanned.entryCount,manager.getEntries().length);
  assert.equal(scanned.bytes,original.length);
  assert.deepEqual(readFileSync(path),original);
  assert.deepEqual(readFileSync(join(fixtureDir,name)),original);
});

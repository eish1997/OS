import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {config} from '../../server/config.ts';
import {join} from 'node:path';
const before=JSON.parse(readFileSync('output/dev-evidence/client-recovery-production-before.json','utf8'));
const db=new DatabaseSync(join(config.dataDir,'workbench.sqlite'),{readOnly:true});
try {
 const rows=db.prepare('SELECT hash,created,expires FROM sessions ORDER BY hash').all();assert.equal(rows.length,32);
 const newRows=rows.filter(row=>Number(row.created)>Date.parse(before.at));assert.equal(newRows.length,1);
 const original=rows.filter(row=>row.hash!==newRows[0].hash);assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),before.sessions.fingerprint);
 // Before the fixture sign-in, the real settings UI identified the current
 // IAB session as 2026/10/6 12:55:24 Asia/Shanghai. Require a unique match.
 const old=original.filter(row=>Number(row.created)>=Date.parse('2026-10-06T04:55:24Z')&&Number(row.created)<Date.parse('2026-10-06T04:55:25Z'));assert.equal(old.length,1);
 writeFileSync('output/dev-evidence/private/browser-session-rotation.json',JSON.stringify({old:old[0],replacement:newRows[0],otherSessions:original.filter(row=>row.hash!==old[0].hash),allBeforeRotation:rows}));
 console.log(JSON.stringify({status:'ownership-proven',originalRowsUnchanged:31,currentBrowserOldSessionUnique:true,newCurrentBrowserSessions:1,total:32}));
}finally{db.close();}

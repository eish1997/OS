import {Store} from '../../server/store.js';
import {backup,restore} from '../../server/backup.js';
import {continuationFor} from '../../server/native-session.js';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {Run} from '../../shared/contracts.js';
const base=resolve('output/dev-evidence/private/migration-058');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const old=new Store(join(base,'before/data/workbench.sqlite'),{readOnly:true}),now=new Store(resolve('data/workbench.sqlite'));
const clean=(v:any,kind:string)=>{v={...v};if(kind==='run'||kind==='session_binding'){for(const k of ['revision','updatedAt','sessionPath','workerPid','leaseOwner','leaseUntil','cwd','pid','worker'])delete v[k];}return v;};
try{
 const original=old.db.prepare('SELECT kind,id,body FROM entities ORDER BY kind,id').all();
 for(const r of original){const fresh=now.get(String(r.kind),String(r.id));if(JSON.stringify(clean(JSON.parse(String(r.body)),String(r.kind)))!==JSON.stringify(clean(fresh,String(r.kind))))throw Error('Business record changed: '+r.kind);}
 const manifest=backup(now,resolve('data'),join(base,'portable-backup'));
 restore(join(base,'portable-backup'),join(base,'restore-check'));
 const recovered=new Store(join(base,'restore-check/workbench.sqlite'),{readOnly:true});
 let completedSessions=0;try{for(const r of recovered.list<Run>('run').filter(r=>r.mode==='pi'&&r.status==='completed'&&r.sessionPath&&r.sessionId)){if(!continuationFor(recovered,r.projectId,r.policy,r.id,'archive'))throw Error('Continuation missing');completedSessions++;}}finally{recovered.close();}
 const assets=now.list<any>('asset').filter(a=>!a.contentRemoved);for(const a of assets)if(sha(join('data/assets',a.locator))!==a.hash)throw Error('Asset hash changed');
 const report={at:new Date().toISOString(),businessRecordsPreserved:original.length,assetHashesVerified:assets.length,portableBackupFiles:manifest.files.length,restoreVerified:true,completedSessionsVerified:completedSessions,integrity:now.db.prepare('PRAGMA integrity_check').get(),modelRequests:0};writeFileSync('output/dev-evidence/migration-058-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{old.close();now.close();}

import {readFileSync,writeFileSync,existsSync,mkdirSync,cpSync,renameSync} from 'node:fs';
import {resolve,join,win32} from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../../server/store.js';
import {inspectNative,continuationFor} from '../../server/native-session.js';
import type {Run,SessionBinding} from '../../shared/contracts.js';
const root=resolve('data'),oldRoot='E:\\AI\\OS\\data';
const saved='output/dev-evidence/private/migration-058/before';
if(!existsSync(join(saved,'data/workbench.sqlite')))throw Error('Missing migration snapshot');
const store=new Store(join(root,'workbench.sqlite'));
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const remap=(p:string)=>{const rel=win32.relative(oldRoot,p);if(!rel||rel.startsWith('..')||win32.isAbsolute(rel))throw Error('Unexpected source path');return join(root,rel);};
try{
 const runs=store.list<Run>('run'),bindings=store.list<SessionBinding>('session_binding');
 if(runs.some(r=>['queued','running','waiting_user','waiting_node'].includes(r.status)))throw Error('Active tasks exist');
 const absent=runs.filter(r=>r.sessionPath&&!existsSync(remap(r.sessionPath)));
 if(absent.some(r=>r.status!=='failed'||bindings.some(b=>b.runId===r.id)))throw Error('Missing session for a nonfailed or bound run');
 const native=runs.filter(r=>r.sessionPath&&r.sessionId&&existsSync(remap(r.sessionPath))).map(r=>{const path=remap(r.sessionPath!);inspectNative(path,r.sessionId!,root,r.projectId,'archive');return {id:r.id,path,hash:sha(path)};});
 for(const b of bindings){if(!existsSync(remap(b.sessionPath)))throw Error('Missing binding session');if(remap(b.cwd)!==join(root,'workspaces',b.projectId))throw Error('Unexpected workspace');}
 const beforeCounts={sessions:store.db.prepare('SELECT count(*) n FROM sessions').get()!.n,locks:store.db.prepare('SELECT count(*) n FROM locks').get()!.n};
 store.transaction(()=>{
  for(const r of runs){store.update<Run>('run',r.id,r.revision,{sessionPath:r.sessionPath?remap(r.sessionPath):undefined,workerPid:undefined,leaseOwner:undefined,leaseUntil:undefined});}
  for(const b of bindings){store.update<SessionBinding>('session_binding',b.id,b.revision,{sessionPath:remap(b.sessionPath),cwd:remap(b.cwd),pid:undefined,worker:undefined});}
  store.db.exec('DELETE FROM sessions; DELETE FROM node_tokens; DELETE FROM locks;');
  // A backup on the previous machine is not a recovery point on this machine.
  store.db.prepare("DELETE FROM metadata WHERE key='automatic_backup'").run();
 });
 const continuations=store.list<Run>('run').filter(r=>r.status==='completed'&&r.mode==='pi'&&r.sessionPath&&r.sessionId).map(r=>({id:r.id,ok:Boolean(continuationFor(store,r.projectId,r.policy,r.id,'archive'))}));
 for(const n of native)if(sha(n.path)!==n.hash)throw Error('Native content changed');
 const env=readFileSync('.env','utf8');if(/^BACKUP_DIR=/m.test(env))throw Error('Unexpected existing backup override');
 writeFileSync('.env',env.replace(/\s*$/,'')+'\nBACKUP_DIR=C:\\Users\\ZYF\\AI-OS-Backups\n');
 const archive=resolve('.runtime/migration-058-old-machine');mkdirSync(archive,{recursive:false});
 for(const n of ['local-service-workbench.json','supervisor-workbench.json','supervisor-workbench.stop.json']){const p=resolve('.runtime',n);if(existsSync(p))renameSync(p,join(archive,n));}
 const report={at:new Date().toISOString(),oldRoot,newRoot:root,runsUpdated:runs.length,bindingsUpdated:bindings.length,nativeFilesVerified:native.length,preexistingAbsentFailedSessions:absent.map(r=>r.id),continuations,retired:beforeCounts,credentialsPreserved:['credentials.json','private-model/host.json','private-model/chatgpt.json'].every(p=>sha(join(root,p))===sha(join(saved,'data',p))),backupRoot:'C:\\Users\\ZYF\\AI-OS-Backups',modelRequests:0};
 writeFileSync('output/dev-evidence/migration-058-paths.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{store.close();}

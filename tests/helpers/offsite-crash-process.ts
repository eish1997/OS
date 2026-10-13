import {readFileSync,writeSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {OffsiteBackup} from '../../server/offsite-backup.js';
import {OffsiteWork} from '../../server/offsite-work.js';
const [rawRoot,nonce,phase,snapshot,id]=process.argv.slice(2),root=resolve(rawRoot),fixture=JSON.parse(readFileSync(join(root,'.offsite-crash-fixture.json'),'utf8'));
if(fixture.nonce!==nonce||!['stage','data','commit'].includes(phase)||!resolve(snapshot).startsWith(root+sep))throw new Error('Owned crash fixture required');
const emit=(value:unknown)=>writeSync(1,JSON.stringify(value)+'\n');
function checkpoint(path:string){emit({kind:'checkpoint',phase,pid:process.pid,path});for(;;)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,60000);}
const create=OffsiteWork.prototype.create,finished=OffsiteWork.prototype.transportFinished;let steps=0;
OffsiteWork.prototype.create=function(...args){const path=create.apply(this,args);if(phase==='stage')checkpoint(path);return path;};
OffsiteWork.prototype.transportFinished=function(path){finished.call(this,path);steps++;if((phase==='data'&&steps===2)||(phase==='commit'&&steps===4))checkpoint(path);};
await new OffsiteBackup({binary:fixture.binary,configFile:join(root,'rclone.conf'),workRoot:join(root,'work'),discardWork:true,onExit:e=>emit({kind:'transport-exit',...e})}).upload(snapshot,id);
throw new Error('Crash checkpoint was not reached');

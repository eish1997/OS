import {join} from 'node:path';
import {Store} from './store.js';
import {OffsiteBackup} from './offsite-backup.js';
import type {OffsiteWorkerJob} from './automatic-backup.js';
const controller=new AbortController();let started=false;
process.on('disconnect',()=>controller.abort());
process.on('message',async(job:OffsiteWorkerJob|{type:'cancel'})=>{
 if('type' in job){controller.abort();return;}if(started)return;started=true;
 let store:Store|undefined;let timer:ReturnType<typeof setInterval>|undefined;
 try{
  store=new Store(join(job.dataRoot,'workbench.sqlite'),{readOnly:true});
  const lease=()=>{const r=store!.db.prepare("SELECT owner,until_ms FROM locks WHERE name='offsite-backup'").get();if(r?.owner!==job.leaseOwner||Number(r.until_ms)<=Date.now()){controller.abort();throw new Error('Offsite lease lost');}};
  lease();timer=setInterval(()=>{try{lease();}catch{}},1000);timer.unref();
  const transport:{pid?:number;code:number|null;signal:NodeJS.Signals|null}[]=[];
  const result=await new OffsiteBackup({...job.options,signal:controller.signal,discardWork:true,onExit:e=>transport.push(e)}).upload(job.snapshot,job.id);lease();
  if(controller.signal.aborted)throw new Error('Offsite stopped');
  process.send?.({type:'completed',result:{...result,transport}},()=>process.disconnect?.());
 }catch{process.exitCode=1;if(process.connected)process.send?.({type:'failed'},()=>process.disconnect?.());}
 finally{if(timer)clearInterval(timer);store?.close();}
});

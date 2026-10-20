import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../../server/store.js';
import {backup} from '../../server/backup.js';

process.once('message',(job:{root:string;destination:string;release:string;owner:string})=>{
  const store=new Store(join(job.root,'workbench.sqlite'),{readOnly:true});
  try{
    const original=store.db.exec.bind(store.db);
    store.db.exec=(sql:string)=>{
      if(sql.startsWith('VACUUM INTO')){
        process.send!({phase:'snapshot'});const deadline=Date.now()+10000;const wait=new Int32Array(new SharedArrayBuffer(4));
        while(!existsSync(job.release)&&Date.now()<deadline)Atomics.wait(wait,0,0,10);
        if(!existsSync(job.release))throw new Error('Parent did not release snapshot');
      }
      return original(sql);
    };
    backup(store,job.root,job.destination,job.owner);process.send!({phase:'done'});
  }catch(error){process.send!({error:String(error)});process.exitCode=1;}
  finally{store.close();process.disconnect!();}
});

import { createHash } from 'node:crypto';
import { lstatSync,realpathSync,readFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { Store } from './store.js';
import { AssetSearch } from './search.js';
import type { Asset } from '../shared/contracts.js';
// One host-created read-only query. No config/.env/model credentials or tools.
process.once('message',(job:{database:string;projectId:string;query:string;offset:number;limit:number})=>{
  let store:Store|undefined;
  try{
    const database=resolve(job.database);const root=dirname(database);const assets=join(root,'assets');
    for(const path of [root,database,assets])if(lstatSync(path).isSymbolicLink()||realpathSync(path)!==path)throw new Error('Invalid search root');
    store=new Store(database,{readOnly:true});
    // Read-only, per-query virtual mapping; SQLite handles WAL coherency. No
    // persistent setting, new index, model request, or larger storage allowance.
    // Unsupported builds retain SQLite's normal reads. At most two owned queries.
    store.db.exec('PRAGMA mmap_size=1073741824');const repairs=new Set<string>();
    const read=(asset:Asset)=>{
      if(asset.projectId!==job.projectId||asset.status!=='ready'||!/^[a-zA-Z0-9-]+$/.test(asset.locator))throw new Error('Invalid asset scope');
      const path=join(assets,asset.locator);const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10*1024**2||realpathSync(path)!==path)throw new Error('Invalid asset file');
      const bytes=readFileSync(path);if(createHash('sha256').update(bytes).digest('hex')!==asset.hash)throw new Error('Changed asset');return bytes;
    };
    const search=new AssetSearch(store,read,{readOnly:true,repair:a=>repairs.add(a.id)});const page=search.search(job.projectId,job.query,job.offset,job.limit);
    store.close();store=undefined;process.send!({type:'completed',result:{page,repairs:[...repairs]}},()=>process.disconnect!());
  }catch{store?.close();process.exitCode=1;process.send!({type:'failed'},()=>process.disconnect!());}
});

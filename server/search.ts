import { TextDecoder } from 'node:util';
import { isUtf8 } from 'node:buffer';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Asset, AssetSearchPage } from '../shared/contracts.js';
import { AppError, Store } from './store.js';
const isText = (a: Asset) => a.mime.startsWith('text/') || ['application/json', 'application/ld+json', 'application/xml', 'application/javascript', 'image/svg+xml'].includes(a.mime);
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
// SQLite LIKE folds ASCII only. For a UTF-8 index, ASCII bytes cannot occur
// inside a multibyte character. Bound candidate checks, then use native LIKE
// for dense matches; NUL retains SQLite's end-of-text behavior.
function asciiAnchor(bytes:Uint8Array,needle:Buffer):number {
  const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(!isUtf8(data))return -1;
  const nul=data.indexOf(0),end=nul<0?data.length:nul;
  const first=needle[0],alternate=first>=65&&first<=90?first+32:first>=97&&first<=122?first-32:first;
  let at=0;
  for(let checks=0;checks<64;checks++){
    const a=data.indexOf(first,at),b=alternate===first?-1:data.indexOf(alternate,at);
    const position=a<0?b:b<0?a:Math.min(a,b);
    if(position<0||position+needle.length>end)return 0;
    let same=true;
    for(let i=0;i<needle.length;i++){
      const x=data[position+i],y=needle[i];
      if(x!==y&&!(y>=65&&y<=90&&x===y+32)&&!(y>=97&&y<=122&&x===y-32)){same=false;break;}
    }
    if(same)return 1;at=position+1;
  }
  return -1;
}
const validQuery=(query:string,offset:number,limit:number)=>{if(typeof query!=='string'||!query.trim()||query.length>120||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new AppError(400,'搜索词或页码无效');};
type SearchOptions={readOnly?:boolean;repair?:(asset:Asset)=>void};
type SearchReceipt={page:AssetSearchPage;repairs:string[]};
export class AssetSearch {
  private workers=new Map<ChildProcess,Promise<void>>();private closing=false;
  private utf8Index:boolean;
  constructor(private store: Store, private read: (asset: Asset) => Buffer, private options:SearchOptions={}) {
    this.utf8Index=store.db.prepare('PRAGMA encoding').get()?.encoding==='UTF-8';
    if(options.readOnly)return;
    store.db.exec("CREATE TABLE IF NOT EXISTS asset_search(asset_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,name TEXT NOT NULL,tags TEXT NOT NULL,content TEXT NOT NULL,hash TEXT NOT NULL,revision INTEGER NOT NULL,content_status TEXT NOT NULL); CREATE INDEX IF NOT EXISTS asset_search_scope ON asset_search(project_id); INSERT OR IGNORE INTO metadata VALUES('asset_search_schema','1');");
  }
  index(asset: Asset, data?: Buffer) {
    if(this.options.readOnly)throw new AppError(503,'只读搜索不能修改索引');
    if (asset.status !== 'ready') { this.remove(asset.id); return; }
    let content = ''; let state = 'binary';
    if (isText(asset)) { try { content = new TextDecoder('utf-8', { fatal: true }).decode(data ?? this.read(asset)); state = 'text'; } catch { state = 'unavailable'; } }
    this.store.guardDatabase(Buffer.byteLength(content) + 2048, () => this.store.db.prepare('INSERT INTO asset_search VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,tags=excluded.tags,content=excluded.content,hash=excluded.hash,revision=excluded.revision,content_status=excluded.content_status').run(asset.id, asset.projectId, asset.name, (asset.tags ?? []).join('\n'), content, asset.hash, asset.revision, state));
  }
  remove(id: string) { this.store.guardDatabase(1024, () => this.store.db.prepare('DELETE FROM asset_search WHERE asset_id=?').run(id), true); }
  reconcile() {
    this.store.db.exec("DELETE FROM asset_search WHERE asset_id NOT IN (SELECT id FROM entities WHERE kind='asset' AND json_extract(body,'$.status')='ready')");
    for (const asset of this.store.list<Asset>('asset').filter(a => a.status === 'ready')) { const row = this.store.db.prepare('SELECT hash,revision,content_status FROM asset_search WHERE asset_id=?').get(asset.id); if (!row || row.hash !== asset.hash || row.revision !== asset.revision || row.content_status === 'unavailable') { try { this.index(asset); } catch (error) { if (!(error instanceof AppError) || ![507,423].includes(error.status)) throw error; } } }
  }
  search(projectId: string, query: string, offset = 0, limit = 50): AssetSearchPage {
    validQuery(query,offset,limit);
    const q = query.trim(); const p = pattern(q);
    const fast=this.utf8Index&&/^[\x01-\x7f]+$/.test(q)&&this.store.db.prepare("SELECT 'a' LIKE 'A' compatible").get()?.compatible===1;
    if(fast){const needle=Buffer.from(q);this.store.db.function('asset_search_ascii_anchor',{deterministic:true},(value)=>value instanceof Uint8Array?asciiAnchor(value,needle):-1);}
    const contentMatch=fast?"CASE asset_search_ascii_anchor(CASE WHEN typeof(x.content)='text' THEN CAST(x.content AS BLOB) END) WHEN 1 THEN 1 WHEN 0 THEN 0 ELSE x.content LIKE ? ESCAPE '\\' END":"x.content LIKE ? ESCAPE '\\'";
    const where = `FROM asset_search x JOIN entities e ON e.id=x.asset_id AND e.kind='asset' WHERE x.project_id=? AND e.project_id=? AND json_extract(e.body,'$.status')='ready' AND e.revision=x.revision AND (x.name LIKE ? ESCAPE '\\' OR x.tags LIKE ? ESCAPE '\\' OR ${contentMatch})`;
    // Match once. Keep only IDs/metadata; large indexed bodies are read for the
    // selected page, never copied into an all-results JS array.
    const args = [projectId, projectId, p, p, p];
    const matches=this.store.db.prepare(`SELECT x.asset_id,e.body ${where} ORDER BY e.rowid DESC`).all(...args);const total=matches.length;
    const rows=matches.slice(offset,offset+limit);
    const items: AssetSearchPage['items'] = []; const issues: AssetSearchPage['issues'] = [];
    for (const row of rows) {
      const asset = JSON.parse(String(row.body)) as Asset;
      let bytes: Buffer;
      try { bytes = this.read(asset); } catch { issues.push({ assetId: asset.id, name: asset.name, error: '内容缺失或校验失败，不能作为可用结果' }); continue; }
      let content = '';let indexedBytes:Buffer=Buffer.alloc(0);
      if (isText(asset)) { try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);indexedBytes=bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf?bytes.subarray(3):bytes; } catch {} }
      // The file is authoritative; a damaged derived index must not invent evidence.
      // UTF-8 SQLite text has exactly the decoder's bytes (apart from its stripped
      // leading BOM). Compare those bytes without copying a large UTF-16 string.
      // Other database encodings retain the original string comparison.
      const indexed=this.store.db.prepare(this.utf8Index?'SELECT CAST(content AS BLOB) content FROM asset_search WHERE asset_id=?':'SELECT content FROM asset_search WHERE asset_id=?').get(asset.id);
      const same=this.utf8Index?indexed?.content instanceof Uint8Array&&indexedBytes.equals(indexed.content):content===String(indexed?.content);
      if(!same){if(this.options.readOnly)this.options.repair?.(asset);else this.index(asset,bytes);}
      const folded = q.toLowerCase(); const position = content.toLowerCase().indexOf(folded);
      if (!asset.name.toLowerCase().includes(folded) && !(asset.tags ?? []).some(t => t.toLowerCase().includes(folded)) && position < 0) { issues.push({ assetId: asset.id, name: asset.name, error: '索引不一致，已跳过此条；请重新搜索' }); continue; }
      const matched = asset.name.toLowerCase().includes(folded) ? 'name' : (asset.tags ?? []).some(t => t.toLowerCase().includes(folded)) ? 'tags' : 'content';
      const start = Math.max(0, position - 60); const snippet = matched === 'content' ? `${start ? '…' : ''}${content.slice(start, start + 220)}${content.length > start + 220 ? '…' : ''}` : matched === 'tags' ? (asset.tags ?? []).join(' · ') : '';
      items.push({ asset, matched, snippet });
    }
    return { items, issues, total, nextOffset: offset + rows.length < total ? offset + rows.length : undefined };
  }
  async searchAsync(projectId:string,query:string,offset=0,limit=50,signal?:AbortSignal,validate?:()=>void):Promise<AssetSearchPage>{
    validQuery(query,offset,limit);
    if(this.closing||signal?.aborted)throw new AppError(503,'搜索已结束');
    if(this.workers.size>=2)throw new AppError(429,'搜索正在处理，请稍后重试');
    const env=Object.fromEntries(['SystemRoot','USERPROFILE','TEMP','TMP','PATH','APPDATA','LOCALAPPDATA','HOME','LANG','TZ'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]!]));
    const child=fork(fileURLToPath(new URL('./search-worker.ts',import.meta.url)),[],{execArgv:['--import','tsx'],env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    let receipt:SearchReceipt|undefined;let failed=false;let ended=false;
    let resolveExit!:()=>void;const exited=new Promise<void>(done=>{resolveExit=done;});this.workers.set(child,exited);
    const result=await new Promise<SearchReceipt>((done,reject)=>{
      const abort=()=>{failed=true;child.kill();};const timer=setTimeout(abort,30000);timer.unref();signal?.addEventListener('abort',abort,{once:true});
      const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      child.on('message',(message:{type?:string;result?:SearchReceipt})=>{if(message.type==='completed')receipt=message.result;else failed=true;});
      child.once('error',()=>{clean();reject(new AppError(503,'搜索进程未完成'));});
      child.once('exit',code=>{ended=true;clean();this.workers.delete(child);resolveExit();if(code===0&&!failed&&receipt)done(receipt);else reject(new AppError(503,'搜索未完成，请重试'));});
      child.once('close',()=>{if(!ended){this.workers.delete(child);resolveExit();}});
      if(signal?.aborted)abort();else child.send({database:this.store.path,projectId,query,offset,limit},error=>{if(error)abort();});
    });
    if(this.closing||signal?.aborted)throw new AppError(503,'搜索已结束');
    validate?.();
    const page=result.page;const checked:AssetSearchPage['items']=[];
    for(const item of page.items){
      try{const current=this.store.get<Asset>('asset',item.asset.id);if(current.projectId!==projectId||current.status!=='ready'||current.revision!==item.asset.revision||current.hash!==item.asset.hash)throw new Error();checked.push(item);}
      catch{page.issues.push({assetId:item.asset.id,name:item.asset.name,error:'资料已发生变化，请重新搜索'});}
    }
    page.items=checked;
    for(const id of result.repairs){
      try{const current=this.store.get<Asset>('asset',id);if(current.projectId!==projectId||current.status!=='ready')continue;this.index(current,this.read(current));}
      catch{const item=page.items.find(i=>i.asset.id===id);page.issues.push({assetId:id,name:item?.asset.name??'资料',error:'索引修复未完成，请检查可用空间或资料状态'});}
    }
    return page;
  }
  async close(){this.closing=true;const workers=[...this.workers];for(const [child] of workers)child.kill();await Promise.all(workers.map(([,exited])=>exited));}
}

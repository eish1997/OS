import {createHash,randomUUID} from 'node:crypto';
import {PrivateFiles} from './private-files.js';
import {AppError,Store} from './store.js';
import {mcpEnvironment} from './mcp-runtime.js';
import type {McpManifest} from '../shared/mcp.js';
interface RecordFile {schema:1;id:string;revision:number;entries:Record<string,{version:number;value?:string}>}
/** Reuse the host's owner-only credential files; no secret values in SQLite or backup. */
export class McpCredentials{
  private files:PrivateFiles;
  constructor(private store:Store){if(!store.capacity)throw new Error('MCP凭据需要受控存储');this.files=new PrivateFiles(store.capacity.dataDir,store.capacity);}
  private filename(projectId?:string){if(projectId)this.store.get('project',projectId);return `mcp-${projectId?createHash('sha256').update(projectId).digest('hex'):'global'}.json`;}
  private read(projectId?:string):RecordFile{
    const file=this.files.read<RecordFile>(this.filename(projectId));if(!file)return {schema:1,id:randomUUID(),revision:0,entries:{}};
    if(file.schema!==1||typeof file.id!=='string'||!Number.isSafeInteger(file.revision)||file.revision<0||!file.entries||typeof file.entries!=='object'||Array.isArray(file.entries)||Object.entries(file.entries).some(([name,item])=>!/^MCP_[A-Z0-9_]{1,80}$/.test(name)||!item||!Number.isSafeInteger(item.version)||(item.value!==undefined&&typeof item.value!=='string')))throw new AppError(503,'MCP私有凭据记录无效，未自动覆盖');
    return file;
  }
  status(projectId?:string){const file=this.read(projectId);return {revision:file.revision,entries:Object.entries(file.entries).filter(([,entry])=>entry.value!==undefined).map(([name,entry])=>({name,version:entry.version}))};}
  update(projectId:string|undefined,revision:number,name:string,value:string|null){
    if(!Number.isSafeInteger(revision)||revision<0||!/^MCP_[A-Z0-9_]{1,80}$/.test(name)||!(value===null||typeof value==='string'&&value.length>0&&value.length<=4096&&!/[\r\n\0]/.test(value)))throw new AppError(400,'凭据名称须为MCP_开头的大写变量，值须为1至4096字符且不含换行');
    return this.store.capacity!.exclusive(()=>{
      const file=this.read(projectId);if(file.revision!==revision)throw new AppError(409,'MCP凭据已改变，请重新读取状态');
      if(!Object.hasOwn(file.entries,name)&&Object.keys(file.entries).length>=32)throw new AppError(400,'每个范围最多32个凭据名称');
      file.entries[name]={version:(file.entries[name]?.version??0)+1,...(value===null?{}:{value})};file.revision++;
      if(Buffer.byteLength(JSON.stringify(file))>60000)throw new AppError(400,'MCP凭据记录超过容量上限');
      this.files.save(this.filename(projectId),file);return this.status(projectId);
    });
  }
  resolve(manifest:McpManifest,projectId?:string,environment:NodeJS.ProcessEnv=process.env){
    if(!manifest.enabled)return {environment:{},manifest};
    const global=this.read();const project=projectId?this.read(projectId):undefined;const combined={...environment};const origins:Record<string,{scope:string;version:number;id:string}>={};
    for(const [scope,file] of [['global',global],['project',project]] as const)for(const [name,item] of Object.entries(file?.entries??{}))if(item.value!==undefined){combined[name]=item.value;origins[name]={scope,version:item.version,id:file!.id};}
    const selected=mcpEnvironment(manifest,combined);const references=Object.keys(selected).sort().filter(name=>origins[name]).map(name=>({name,...origins[name]}));
    const signature=references.length?createHash('sha256').update(JSON.stringify({configuration:manifest.signature,credentials:references})).digest('hex'):manifest.signature;
    return {environment:selected,manifest:{...manifest,signature}};
  }
}

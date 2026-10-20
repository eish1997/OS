import {createHash} from 'node:crypto';
import type {McpServerConfig,McpServerEntry} from '@earendil-works/pi-coding-agent';
import type {McpConfiguration,McpDocument,McpManifest} from '../shared/mcp.js';
import {Store,AppError} from './store.js';

// Fixed Pi 1.0.3 exposes the config types, but not its validator. Keep the pinned
// native parser in one adapter instead of duplicating its transport semantics.
let validator:((name:string,value:unknown)=>McpServerConfig|string)|undefined;
async function nativeValidator(){return validator??=(await import(new URL('./core/mcp-servers.js',import.meta.resolve('@earendil-works/pi-coding-agent')).href)).validateMcpServerConfig;}
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const override=(value:Record<string,unknown>)=>value.command===undefined&&value.url===undefined&&value.type===undefined;
const secretName=/(authorization|cookie|token|secret|password|api.?key|credential)/i;
function credentialReferences(name:string,value:Record<string,unknown>){
  for(const field of ['env','headers'])if(record(value[field]))for(const [key,entry] of Object.entries(value[field])){
    if(secretName.test(key)&&typeof entry==='string'&&!(field==='headers'?/^(?:Bearer |Basic )?\$\{[A-Za-z_][A-Za-z0-9_]*\}$/:/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/).test(entry))throw new AppError(400,`${name}.${field}.${key}请使用环境变量引用，凭据不得写入普通配置`);
  }
  if(record(value.oauth)&&value.oauth.clientSecret!==undefined)throw new AppError(400,`${name}的OAuth客户端密钥需要专用凭据入口，当前不能导入`);
  if(typeof value.url==='string'){
    let url:URL;try{url=new URL(value.url);}catch{throw new AppError(400,`${name}的URL无效`);}if(url.username||url.password||[...url.searchParams.keys()].some(key=>secretName.test(key)))throw new AppError(400,`${name}的URL包含凭据字段，请改用凭据引用`);
  }
}
export class McpConfigurations{
  constructor(readonly store:Store){}
  configuration(projectId?:string):McpConfiguration|undefined{
    if(projectId)this.store.get('project',projectId);
    return this.store.list<McpConfiguration>('mcp_config').find(c=>c.id===`mcp:${projectId??'global'}`);
  }
  private merged(projectId?:string,proposed?:{document:McpDocument;source:string;active:boolean;codemode:boolean;toolSearch:boolean}):Omit<McpManifest,'signature'|'schemaVersion'> {
    const global=this.configuration();const project=projectId?this.configuration(projectId):undefined;
    const layers=projectId?[global,proposed??project]:[proposed??global];const servers=new Map<string,McpServerEntry>();let autoEnableCodemode=true;let codemode=false;let toolSearch=false;
    for(let index=0;index<layers.length;index++){
      const layer=layers[index];if(!layer?.active)continue;const scope=projectId&&index===1?'project':'global';
      autoEnableCodemode=layer.document.autoEnableCodemode??autoEnableCodemode;codemode=codemode||layer.codemode;toolSearch=toolSearch||layer.toolSearch;
      for(const [name,raw] of Object.entries(layer.document.mcpServers)){
        const clash=[...servers.keys()].find(existing=>existing!==name&&existing.replaceAll('-','_')===name.replaceAll('-','_'));
        if(clash)throw new AppError(400,`MCP名称${name}与${clash}映射到同一工具空间`);
        if(override(raw as Record<string,unknown>)){
          const base=servers.get(name);if(scope!=='project'||!base)throw new AppError(400,`${name}没有可覆盖的已启用全局定义`);
          servers.set(name,{...base,config:{...base.config,...raw},override:layer.source});
        }else servers.set(name,{name,config:raw as McpServerConfig,scope,source:layer.source});
      }
    }
    return {enabled:layers.some(layer=>layer?.active===true),globalRevision:global?.revision??0,projectRevision:project?.revision??0,servers:[...servers.values()].sort((a,b)=>a.name.localeCompare(b.name)),autoEnableCodemode,codemode,toolSearch};
  }
  async preview(raw:unknown,projectId?:string){
    if(projectId)this.store.get('project',projectId);
    if(typeof raw!=='string'||raw.length>128000)throw new AppError(400,'MCP配置必须为不超过128k字符的JSON');
    let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new AppError(400,'MCP配置JSON无效');}
    if(!record(parsed)||!record(parsed.mcpServers)||Object.keys(parsed).some(k=>!['mcpServers','autoEnableCodemode'].includes(k))||Object.keys(parsed.mcpServers).length>64)throw new AppError(400,'需要mcpServers对象，最多64项');
    if(parsed.autoEnableCodemode!==undefined&&typeof parsed.autoEnableCodemode!=='boolean')throw new AppError(400,'autoEnableCodemode必须为布尔值');
    const validate=await nativeValidator();const servers:Record<string,McpServerConfig>=Object.create(null);const warnings:string[]=[];
    for(const [name,value] of Object.entries(parsed.mcpServers)){
      if(!record(value))throw new AppError(400,`${name}的服务器定义无效`);
      if(Object.keys(value).some(key=>!['command','args','env','cwd','type','exposure','enabled','timeout','toolExposure','description','url','headers','oauth','auth'].includes(key)))throw new AppError(400,`${name}含固定Pi版本不支持的配置字段`);
      credentialReferences(name,value);
      if(value.timeout!==undefined&&(typeof value.timeout!=='number'||!Number.isFinite(value.timeout)))throw new AppError(400,`${name}的timeout必须是有限数值`);
      if(override(value)){
        if(!projectId||Object.keys(value).some(k=>!['enabled','exposure','toolExposure'].includes(k)))throw new AppError(400,`${name}仅项目配置可覆盖enabled/exposure/toolExposure`);
        const base=this.merged().servers.find(s=>s.name===name);if(!base)throw new AppError(400,`${name}没有可覆盖的全局定义`);
        const checked=validate(name,{...base.config,...value});if(typeof checked==='string')throw new AppError(400,`MCP服务器${name}配置无效`);
        servers[name]=Object.fromEntries(Object.keys(value).map(key=>[key,checked[key as keyof McpServerConfig]])) as McpServerConfig;
      }else{
        const checked=validate(name,value);if(typeof checked==='string')throw new AppError(400,`MCP服务器${name}配置无效`);
        if(projectId&&'url' in checked&&checked.auth)throw new AppError(400,`${name}项目配置不能选择模型提供商凭据`);
        servers[name]=checked;
        if('command' in checked)warnings.push(`${name}启用后会在执行时启动本地程序`);
        else warnings.push(`${name}启用后会连接外部HTTP服务`);
      }
    }
    const document:McpDocument={mcpServers:servers,...(parsed.autoEnableCodemode===undefined?{}:{autoEnableCodemode:parsed.autoEnableCodemode as boolean})};
    const effective=this.merged(projectId,{document,source:'导入预览',active:true,codemode:false,toolSearch:false});
    return {document,effective,warnings};
  }
  async update(input:{projectId?:string;revision:number;globalRevision?:number;json:string;source:string;active:boolean;trusted:boolean;codemode:boolean;toolSearch:boolean}){
    if(!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.source!=='string'||!input.source.trim()||input.source.length>500||![input.active,input.codemode,input.toolSearch].every(v=>typeof v==='boolean'))throw new AppError(400,'MCP配置版本、来源或开关无效');
    if(input.active&&!input.trusted)throw new AppError(403,'启用MCP需明确确认外部连接与程序执行');
    const {document}=await this.preview(input.json,input.projectId);
    return this.store.transaction(()=>{
      if(input.projectId&&(this.configuration()?.revision??0)!==input.globalRevision)throw new AppError(409,'全局MCP配置已改变，请重新预览项目覆盖');
      const current=this.configuration(input.projectId);if((current?.revision??0)!==input.revision)throw new AppError(409,'MCP配置已改变，请刷新预览后重试');
      // No process or network starts here. Running executions retain their snapshot.
      const fields={schemaVersion:1 as const,active:input.active,source:input.source.trim(),document,codemode:input.codemode,toolSearch:input.toolSearch};
      const next=current?this.store.update<McpConfiguration>('mcp_config',current.id,current.revision,fields):this.store.create<McpConfiguration>('mcp_config',{id:`mcp:${input.projectId??'global'}`,projectId:input.projectId,...fields});
      this.store.event('mcp.configuration_updated',{revision:next.revision,active:next.active},{projectId:input.projectId});return next;
    });
  }
  manifest(projectId?:string):McpManifest{
    const value=this.merged(projectId);const signature=createHash('sha256').update(JSON.stringify({enabled:value.enabled,servers:value.servers,autoEnableCodemode:value.autoEnableCodemode,codemode:value.codemode,toolSearch:value.toolSearch})).digest('hex');
    return {schemaVersion:1,...value,signature};
  }
}

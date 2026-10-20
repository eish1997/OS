import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {McpAuthRequiredError,McpClient,McpHttpError,StdioTransport,StreamableHttpTransport} from '@earendil-works/pi-mcp';
import type {McpServerEntry} from '@earendil-works/pi-coding-agent';
import type {McpDiagnosticCode,McpManifest,McpProbeResult} from '../shared/mcp.js';
import {AppError} from './store.js';
import {terminateProcessTreeByPid} from './owned-process.js';
import type {AuthProvider} from '@earendil-works/pi-mcp';

const PROBE_TIMEOUT_MS=8000;

function expandHome(value:string){
  if(value==='~')return homedir();
  if(value.startsWith('~/')||(process.platform==='win32'&&value.startsWith('~\\')))return join(homedir(),value.slice(2));
  return value;
}

function expand(value:string,env:NodeJS.ProcessEnv,label:string){
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,(_,name:string)=>{
    if(env[name]===undefined)throw new AppError(400,`${label}引用的环境变量${name}尚未配置`);
    return env[name]!;
  });
}

function classify(error:unknown):McpDiagnosticCode{
  const text=error instanceof Error?`${error.message} ${'code' in error?String((error as {code?:unknown}).code):''}`:String(error);
  if(error instanceof McpAuthRequiredError||/sign.in|needs.auth|oauth/i.test(text))return 'needs_auth';
  if(/ENOENT|not found|cannot find|系统找不到|找不到指定的文件/i.test(text))return 'program_missing';
  if(error instanceof McpHttpError&&(error.status===401||error.status===403))return 'permission_denied';
  if(/EACCES|EPERM|\b401\b|\b403\b|permission denied/i.test(text))return 'permission_denied';
  return 'connection_failed';
}

export function usesOAuth(entry:McpServerEntry){
  const {config}=entry;
  if(!('url' in config)||config.auth)return false;
  return !Object.keys(config.headers??{}).some(header=>header.toLowerCase()==='authorization');
}

/** One-shot connection check. Not a live status panel and not an OAuth wizard. */
export async function probeMcpServer(input:{
  manifest:McpManifest;
  name:string;
  cwd:string;
  environment:NodeJS.ProcessEnv;
  authProvider?:AuthProvider;
}):Promise<McpProbeResult>{
  const at=new Date().toISOString();
  const note='单次探测结果，刷新后不会自动保持；不是持续连接状态，也不代替执行时的启动提醒';
  if(!input.manifest.enabled)throw new AppError(409,'MCP配置未启用，不能探测连接');
  const entry=input.manifest.servers.find(server=>server.name===input.name);
  if(!entry||entry.config.enabled===false)throw new AppError(404,'未找到已启用的该MCP服务');
  if(usesOAuth(entry)&&!input.authProvider)return {server:input.name,ok:false,code:'needs_auth',at,note};

  const client=new McpClient({name:'dulse-mcp-probe',version:'1.0.3',requestTimeoutMs:PROBE_TIMEOUT_MS,roots:[{uri:pathToFileURL(input.cwd).href,name:'probe'}]});
  let transport:StdioTransport|StreamableHttpTransport|undefined;
  try{
    const {config}=entry;
    if('url' in config){
      const headers:Record<string,string>={};
      for(const [key,value] of Object.entries(config.headers??{}))headers[key]=expand(String(value),input.environment,`${input.name}.headers.${key}`);
      transport=new StreamableHttpTransport({url:expand(config.url,input.environment,`${input.name}.url`),headers,authProvider:input.authProvider});
    }else{
      const env:Record<string,string>={};
      for(const [key,value] of Object.entries(config.env??{}))env[key]=expand(String(value),input.environment,`${input.name}.env.${key}`);
      const command=expandHome(expand(config.command,input.environment,`${input.name}.command`));
      const cwd=resolve(input.cwd,expandHome(expand(config.cwd??'.',input.environment,`${input.name}.cwd`)));
      const commandPath=isAbsolute(command)?command:resolve(cwd,command);
      if((isAbsolute(command)||command.includes('/')||command.includes('\\'))&&!existsSync(commandPath)){
        return {server:input.name,ok:false,code:'program_missing',at,note};
      }
      transport=new StdioTransport({
        command,
        args:config.args?.map(arg=>expandHome(expand(String(arg),input.environment,`${input.name}.args`))),
        cwd,
        env,
        stderr:'pipe',
        closeTimeoutMs:2000
      });
    }
    await client.connect(transport);
    const tools=client.serverCapabilities?.tools?await client.listTools():[];
    return {server:input.name,ok:true,toolCount:tools.length,at,note};
  }catch(error){
    return {server:input.name,ok:false,code:classify(error),at,note};
  }finally{
    const pid=transport instanceof StdioTransport?transport.pid:undefined;
    await client.close().catch(()=>undefined);
    if(pid)await terminateProcessTreeByPid(pid).catch(()=>undefined);
  }
}

import type {Run} from '../shared/contracts.js';
import type {McpManifest} from '../shared/mcp.js';
import {AppError} from './store.js';
import {resolve} from 'node:path';

export function allowedExtensionSource(run:Run,source:string){
  if(source.startsWith('builtin:'))return run.mcpManifest?.enabled===true&&['builtin:mcp','builtin:codemode','builtin:tool-search'].includes(source);
  return Boolean(run.pluginManifest?.resources.some(r=>r.kind==='extensions'&&resolve(r.path)===resolve(source)));
}

/** Legacy sessions did not enable builtins. Never silently change a used session's tools. */
export function assertMcpCompatible(source:Pick<Run,'mcpManifest'|'startedAt'|'sessionId'>,next:McpManifest){
  if(!source.startedAt&&!source.sessionId)return;
  const prior=source.mcpManifest;
  if(prior?prior.signature!==next.signature:next.enabled)throw new AppError(409,'MCP运行环境已改变，请恢复原配置或开始新话题；原会话与成果保留');
}

/** Only explicitly referenced variables are forwarded; values never enter the manifest. */
export function mcpEnvironment(manifest:McpManifest,environment:NodeJS.ProcessEnv):NodeJS.ProcessEnv{
  const result:NodeJS.ProcessEnv={};if(!manifest.enabled)return result;
  const inspect=(value:unknown)=>{
    if(typeof value==='string')for(const match of value.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)){
      const name=match[1];if(environment[name]===undefined)throw new AppError(400,`MCP引用的环境变量${name}尚未配置`);
      result[name]=environment[name];
    }
    else if(Array.isArray(value))for(const entry of value)inspect(entry);
    else if(value&&typeof value==='object')for(const entry of Object.values(value))inspect(entry);
  };
  for(const server of manifest.servers)if(server.config.enabled!==false)inspect(server.config);
  return result;
}

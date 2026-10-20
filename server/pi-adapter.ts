import * as pi from '@earendil-works/pi-coding-agent';
import { validateRuntimePaths, type PluginResourcePaths } from './plugin-runtime.js';
import {observeMcpTransport} from './mcp-diagnostics.js';
export type PiSession = pi.AgentSession;
export type PiModule = typeof pi;
export type NativeMcpConfiguration=ReturnType<NonNullable<pi.McpExtensionOptions['loadConfig']>>;
export interface BuiltinResources {mcp?:NativeMcpConfiguration;codemode?:boolean;toolSearch?:boolean}
export async function loadPi(): Promise<PiModule> {
  if (typeof pi.createAgentSession !== 'function' || typeof pi.SessionManager.create !== 'function') throw new Error('Pi 版本接口不兼容');
  return pi;
}
export async function workbenchResources(module: PiModule, cwd: string, agentDir: string, prompt: string, resources: PluginResourcePaths = {}, builtins: BuiltinResources = {}, observe?: { mcpConnection?: (server: string, code: 'connected' | 'disconnected' | 'closed') => void }) {
  const paths = validateRuntimePaths(resources);
  // Model retries/compaction stay host-accounted; native tools are selected by each Run.
  const active=[...(builtins.codemode?['+codemode']:[]),...(builtins.toolSearch?['+tool_search']:[])];
  const settings = module.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false, maxRetries: 3, baseDelayMs: 1000, maxAgentDelayMs: 30000, provider: { maxRetries: 0 } }, cacheWarming: 'off', packages: [],...(active.length?{defaultTools:active}:{}) });
  const factories:pi.InlineExtension[]=[];const builtinPaths:string[]=[];
  if(builtins.codemode||builtins.mcp){factories.push({name:'codemode',builtin:true,factory:module.createCodemodeExtension({mode:'on',models:false})});builtinPaths.push('builtin:codemode');}
  if(builtins.toolSearch||builtins.mcp){factories.push({name:'tool-search',builtin:true,factory:module.createToolSearchExtension()});builtinPaths.push('builtin:tool-search');}
  if(builtins.mcp){
    const frozen=structuredClone(builtins.mcp);
    const runtime = await import(new URL('./extensions/mcp/runtime.js', import.meta.resolve('@earendil-works/pi-coding-agent')).href) as { createDefaultTransport: NonNullable<pi.McpExtensionOptions['createTransport']> };
    factories.push({name:'mcp',builtin:true,factory:module.createMcpExtension({loadConfig:()=>structuredClone(frozen),startupWaitMs:10000,
      createTransport: observe?.mcpConnection ? (entry, cwd, auth) => observeMcpTransport(runtime.createDefaultTransport(entry, cwd, auth), code => observe.mcpConnection!(entry.name, code)) : undefined,
      updateConfig:()=>{throw new Error('请通过工作台配置管理修改MCP配置');},openUrl:()=>{throw new Error('MCP登录需要工作台显式交互入口');}})});builtinPaths.push('builtin:mcp');
  }
  const loader = new module.DefaultResourceLoader({
    cwd, agentDir, settingsManager: settings,
    // Keep automatic executable discovery off. Explicit local files are still loaded by Pi.
    // Empty in-memory packages + file-only paths cannot invoke package installation.
    noExtensions: true, noThemes: true,
    additionalExtensionPaths: [...paths.extensions,...builtinPaths],
    extensionFactories:factories,
    additionalSkillPaths: paths.skills,
    additionalPromptTemplatePaths: paths.prompts,
    appendSystemPrompt: [prompt]
  });
  await loader.reload();
  if (loader.getExtensions().errors.length) throw new Error(`插件加载失败：${loader.getExtensions().errors.map(e => `${e.path}: ${e.error}`).join('; ')}`);
  return { settings, loader };
}

import { isAbsolute, resolve } from 'node:path';
import { statSync } from 'node:fs';
import type { LoadExtensionsResult, RegisteredTool, RegisteredCommand } from '@earendil-works/pi-coding-agent';

/** Only resolved local files cross the management/runtime boundary. Never package specs. */
export interface PluginResourcePaths {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
}

export function validateRuntimePaths(resources: PluginResourcePaths): Required<PluginResourcePaths> {
  const checked = (paths: string[] | undefined, type: string) => [...new Set((paths ?? []).map(path => {
    if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(`插件运行资源必须是绝对本地路径：${type}`);
    const full = resolve(path);
    let file;
    try { file = statSync(full); } catch { throw new Error(`插件资源缺失，请在插件管理中修复：${full}`); }
    if (!file.isFile()) throw new Error(`插件运行资源必须解析到文件：${full}`);
    if (type === 'extensions' && !/\.(?:[cm]?[jt]s)$/.test(full)) throw new Error(`不支持的扩展文件：${full}`);
    return full;
  }))];
  return { extensions: checked(resources.extensions, 'extensions'), skills: checked(resources.skills, 'skills'), prompts: checked(resources.prompts, 'prompts') };
}

/** Checks both the initial registry and later registrations before Pi can overwrite a tool. */
export function guardPluginRegistrations(result: LoadExtensionsResult, reservedTools: readonly string[], onTool?: (name: string, source: string) => void, beforeExecute?: (id:string,name:string)=>Promise<void>) {
  if (result.errors.length) throw new Error(`插件加载失败：${result.errors.map(e => `${e.path}: ${e.error}`).join('; ')}`);
  const toolSources = new Map<string, string>(reservedTools.map(name => [name, '工作台/原生工具']));
  const commandSources = new Map<string, string>();
  function protect<T>(map: Map<string, T>, owners: Map<string, string>, source: string, type: string, changed?: (name: string, source: string) => void, prepare?:(value:T)=>void) {
    const register = (name: string) => {
      // Native MCP refreshes same-owner definitions on tools/list_changed, including
      // hiding tools withdrawn by a server. Cross-source ownership never changes.
      if (owners.has(name) && !(type==='工具'&&source==='builtin:mcp'&&owners.get(name)===source)) throw new Error(`${type}名称冲突：${name}（${owners.get(name)} / ${source}）`);
      owners.set(name, source);
    };
    for (const [name,value] of map) {register(name);prepare?.(value);}
    const set = map.set.bind(map);
    map.set = (name, value) => { register(name); prepare?.(value); const result = set(name, value); changed?.(name, source); return result; };
    const remove = map.delete.bind(map);
    map.delete = name => { const removed = remove(name); if (removed && owners.get(name) === source) owners.delete(name); return removed; };
    const clear = map.clear.bind(map);
    map.clear = () => { for (const name of map.keys()) if (owners.get(name) === source) owners.delete(name); clear(); };
  }
  for (const extension of result.extensions) {
    protect<RegisteredTool>(extension.tools, toolSources, extension.path, '工具', onTool, beforeExecute ? tool=>{
      const execute=tool.definition.execute;
      tool.definition.execute=async(...args)=>{await beforeExecute(args[0],tool.definition.name);if(args[2]?.aborted)throw new Error('工具执行已取消');return execute(...args);};
    }:undefined);
    protect<RegisteredCommand>(extension.commands, commandSources, extension.path, '命令');
  }
  const reserveCommands = (resources: { name: string; source: string }[]) => {
    for (const resource of resources) {
      const owner = commandSources.get(resource.name);
      if (owner && owner !== resource.source) throw new Error(`命令名称冲突：${resource.name}（${owner} / ${resource.source}）`);
      commandSources.set(resource.name, resource.source);
    }
  };
  return { toolSources, commandSources, reserveCommands };
}

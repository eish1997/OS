import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { pluginSource } from './plugin-packages.js';

/** Check the same explicit PATH given to Pi before invoking any package command. */
export function assertPluginPrerequisites(source: string, env: NodeJS.ProcessEnv = process.env) {
  const kind=pluginSource(source).kind;
  const tools=kind==='git'?['git','npm']:kind==='npm'?['npm']:[];
  const suffixes=process.platform==='win32'?(env.PATHEXT||'.EXE;.CMD;.BAT').split(';'):[''];
  for(const tool of tools){
    const found=(env.PATH||'').split(delimiter).filter(Boolean).some(directory=>suffixes.some(suffix=>{
      const path=join(directory.replace(/^"|"$/g,''),tool+suffix.toLowerCase());
      try{if(!statSync(path).isFile())return false;accessSync(path,process.platform==='win32'?constants.F_OK:constants.X_OK);return true;}catch{return false;}
    }));
    if(!found)throw new Error(`缺少 ${tool} 可执行程序，请安装并将其加入工作台服务的 PATH 后重试`);
  }
}

import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';

// Windows chmod does not establish a private DACL. The fixed helper uses the
// current service identity; no password or shell-generated command is passed.
export function ensureWindowsLocalPermissions(dataDir:string) {
 if(process.platform!=='win32')return;
 const root=process.cwd();
 const shell=join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 const result=spawnSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve(root,'scripts/protect-local-data.ps1'),'-Action','protect','-WorkspaceRoot',root,'-DataDir',dataDir,'-IncludeApplicationWorkspace'],{windowsHide:true,encoding:'utf8',timeout:45000,env:{SystemRoot:process.env.SystemRoot,USERPROFILE:process.env.USERPROFILE,PATH:process.env.PATH}});
 if(result.status!==0)throw new Error('无法保护工作台本机文件权限；服务未启动，请检查权限记录');
 const report=JSON.parse(result.stdout.trim()) as {state:string};
 if(report.state!=='protected')throw new Error('工作台本机权限保护未完成');
}

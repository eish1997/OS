import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

// Only for local directories shared by one host and one PID namespace.
// A PID alone can identify a different process after its original owner exits.
export type ProcessBirth = {platform:'win32';start:string}|{platform:'linux';start:string;boot:string};
export function validProcessBirth(value:unknown):value is ProcessBirth {
 if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 if(typeof v.start!=='string'||!/^[1-9][0-9]{0,19}$/.test(v.start))return false;
 return v.platform==='win32'||(v.platform==='linux'&&typeof v.boot==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.boot));
}
export function parseLinuxProcessBirth(stat:string,boot:string,pid:number):ProcessBirth|undefined {
 // comm is parenthesized and may contain spaces and closing parentheses.
 const end=stat.lastIndexOf(')'),prefix=stat.slice(0,stat.indexOf(' ')),fields=stat.slice(end+1).trim().split(/\s+/);
 if(end<0||prefix!==String(pid)||fields.length<20)return;
 const birth={platform:'linux' as const,start:fields[19],boot:boot.trim()};return validProcessBirth(birth)?birth:undefined;
}
let selfBirth:ProcessBirth|undefined;
export function processBirth(pid:number):ProcessBirth|undefined {
 if(!Number.isSafeInteger(pid)||pid<1)return;
 if(pid===process.pid&&selfBirth)return selfBirth;
 let birth:ProcessBirth|undefined;
 try{
  if(process.platform==='linux')birth=parseLinuxProcessBirth(readFileSync('/proc/'+pid+'/stat','utf8'),readFileSync('/proc/sys/kernel/random/boot_id','utf8'),pid);
  else if(process.platform==='win32'){
   const script="$ErrorActionPreference='Stop';$p=[Diagnostics.Process]::GetProcessById([int]$env:WB_BIRTH_PID);try{$p.StartTime.ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture)}finally{$p.Dispose()}";
   const result=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:5000,maxBuffer:4096,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,WB_BIRTH_PID:String(pid)}});
   if(result.status===0){const value={platform:'win32' as const,start:result.stdout.trim()};if(validProcessBirth(value))birth=value;}
  }
 }catch{/* Unknown permissions/platform/observation never authorize reclaim. */}
 if(pid===process.pid&&birth)selfBirth=birth;return birth;
}
export function sameProcessBirth(a:ProcessBirth,b:ProcessBirth){return a.platform===b.platform&&a.start===b.start&&(a.platform!=='linux'||(b.platform==='linux'&&a.boot===b.boot));}
export function originalProcessGone(pid:number,birth?:ProcessBirth):boolean {
 if(birth&&birth.platform!==process.platform)return false;
 try{process.kill(pid,0);}catch(error){return error instanceof Error&&'code'in error&&error.code==='ESRCH';}
 if(!birth)return false;
 const current=processBirth(pid);return Boolean(current&&!sameProcessBirth(birth,current));
}

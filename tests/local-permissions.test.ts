import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,linkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Windows permissions deny restricted-token reads, preserve bytes, restore ACLs and refuse links', {skip:process.platform!=='win32',timeout:45000},()=>{
 const root=mkdtempSync(join(tmpdir(),'权限 测试 '));mkdirSync(join(root,'server'));writeFileSync(join(root,'package.json'),'{}');writeFileSync(join(root,'server/index.ts'),'// own fixture');
 mkdirSync(join(root,'data'));const file=join(root,'data','private.txt');writeFileSync(file,'synthetic-private-content\n');writeFileSync(join(root,'.env'),'WORKBENCH_PASSWORD=synthetic\n');
 const shell=join(process.env.SystemRoot!,'System32/WindowsPowerShell/v1.0/powershell.exe');
 function command(args:string[]){const r=spawnSync(shell,['-NoProfile','-NonInteractive',...args],{encoding:'utf8',windowsHide:true,timeout:20000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim());}
 const wide="$ErrorActionPreference='Stop'; $p=$env:WB_TEST_FILE; $a=[IO.File]::GetAccessControl($p); $sid=[Security.Principal.SecurityIdentifier]::new('S-1-1-0'); $a.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'Read','Allow'))); [IO.File]::SetAccessControl($p,$a)";
 const seeded=spawnSync(shell,['-NoProfile','-NonInteractive','-Command',wide],{env:{...process.env,WB_TEST_FILE:file},encoding:'utf8',windowsHide:true});assert.equal(seeded.status,0,seeded.stderr);
 const read=()=>command(['-File',resolve('tests/helpers/restricted-file-read.ps1'),'-Path',file]).readAllowed;
 const helper=resolve('scripts/protect-local-data.ps1');const invoke=(action:string,extra:string[]=[])=>command(['-ExecutionPolicy','Bypass','-File',helper,'-Action',action,'-WorkspaceRoot',root,'-IncludeApplicationWorkspace',...extra]);
 assert.equal(read(),true,'Actual restricted token can read broad fixture before protection');const protectedResult=invoke('protect');assert.equal(protectedResult.state,'protected');assert.equal(read(),false,'OS must deny restricted token');assert.equal(readFileSync(file,'utf8'),'synthetic-private-content\n');
 assert.equal(invoke('protect').alreadyProtected,true);const after=join(root,'data','new.txt');writeFileSync(after,'new private file');assert.equal(command(['-File',resolve('tests/helpers/restricted-file-read.ps1'),'-Path',after]).readAllowed,false,'New file must inherit private ACL');
 const alias=join(root,'post-protection-alias.txt');linkSync(file,alias);
 const unsafeRestore=spawnSync(shell,['-NoProfile','-NonInteractive','-File',helper,'-Action','restore','-WorkspaceRoot',root,'-IncludeApplicationWorkspace','-Snapshot',protectedResult.snapshot],{encoding:'utf8',windowsHide:true});assert.notEqual(unsafeRestore.status,0);assert(unsafeRestore.stderr.includes('Hardlinked restore entry refused'));assert.equal(read(),false,'Restore preflight must refuse new aliases before changing any ACL');unlinkSync(alias);
 assert.equal(invoke('restore',['-Snapshot',protectedResult.snapshot]).state,'restored');assert.equal(read(),true,'Original explicit broad ACL restored');
 const foreign=join(root,'foreign.txt');writeFileSync(foreign,'outside-scope');const linked=join(root,'data','hardlink.txt');const linkResult=spawnSync(shell,['-NoProfile','-NonInteractive','-Command',"New-Item -ItemType HardLink -Path $env:WB_LINK -Target $env:WB_FOREIGN | Out-Null"],{env:{...process.env,WB_LINK:linked,WB_FOREIGN:foreign},encoding:'utf8',windowsHide:true});assert.equal(linkResult.status,0,linkResult.stderr);
 const refused=spawnSync(shell,['-NoProfile','-NonInteractive','-File',helper,'-Action','protect','-WorkspaceRoot',root,'-IncludeApplicationWorkspace'],{encoding:'utf8',windowsHide:true});assert.notEqual(refused.status,0);assert(refused.stderr.includes('Hardlinked protection entry refused'));assert.equal(readFileSync(foreign,'utf8'),'outside-scope');assert.equal(read(),true,'Preflight failure must not partially protect earlier entries');
});

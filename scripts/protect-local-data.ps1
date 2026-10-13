param(
 [ValidateSet('status','protect','restore')][string]$Action='status',
 [string]$WorkspaceRoot='', [string]$DataDir='', [string]$Snapshot='',
 [switch]$IncludeDevelopmentEvidence, [switch]$IncludeApplicationWorkspace
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
if(!$WorkspaceRoot){$WorkspaceRoot=Join-Path $PSScriptRoot '..'}
$taskRoot=[IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd('\')
$taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
function Check-Path([string]$path){
 $full=[IO.Path]::GetFullPath($path)
 if($full -eq [IO.Path]::GetPathRoot($full) -or $full -eq $env:USERPROFILE -or $full.StartsWith($env:SystemRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe protection root'}
 $part=$full
 while($part){if(Test-Path -LiteralPath $part){if((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked protection path refused'}};$next=[IO.Path]::GetDirectoryName($part);if($next -eq $part){break};$part=$next}
 return $full
}
$null=Check-Path $taskRoot
if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'package.json')) -or !(Test-Path -LiteralPath (Join-Path $taskRoot 'server/index.ts'))){throw 'Not a workbench workspace'}
if(!$DataDir){$DataDir=Join-Path $taskRoot 'data'}elseif(![IO.Path]::IsPathRooted($DataDir)){$DataDir=Join-Path $taskRoot $DataDir}
$DataDir=Check-Path $DataDir
$taskRoots=@((Join-Path $taskRoot '.env'),$DataDir,(Join-Path $taskRoot '.runtime'))
if($IncludeDevelopmentEvidence){$taskRoots+=Join-Path $taskRoot 'output/dev-evidence/private'}
if($IncludeApplicationWorkspace){
 $taskRoots=@($taskRoot)
 if(!$DataDir.StartsWith($taskRoot+'\',[StringComparison]::OrdinalIgnoreCase)){$taskRoots+=$DataDir}
}
foreach($path in $taskRoots){$null=Check-Path $path}
function Load-LinkAPI {
 if('WorkbenchFileLinks' -as [type]){return}
 Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using Microsoft.Win32.SafeHandles;
public static class WorkbenchFileLinks {
 [StructLayout(LayoutKind.Sequential)]struct Info {public uint attributes;public System.Runtime.InteropServices.ComTypes.FILETIME creation,access,write;public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetFileInformationByHandle(SafeFileHandle file,out Info info);
 public static uint Links(string path){using(var file=CreateFile(path,0,7,IntPtr.Zero,3,0,IntPtr.Zero)){if(file.IsInvalid)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());Info value;if(!GetFileInformationByHandle(file,out value))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return value.links;}}
}
'@
}
function Info-ACL([string]$path){
 $item=Get-Item -LiteralPath $path -Force
 if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked protection entry refused'}
 $acl=$item.GetAccessControl()
 if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskSid.Value){throw 'Protection entry has a different owner'}
 $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
 $private=$acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and $rules[0].IdentityReference.Value -eq $taskSid.Value -and $rules[0].AccessControlType -eq 'Allow' -and (($rules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl)
 return @{path=$item.FullName;directory=$item.PSIsContainer;acl=$acl;private=$private}
}
function Private-ACL([string]$path){
 $null=Check-Path $path
 $info=Info-ACL $path;$acl=$info.acl
 if(!$info.directory){Load-LinkAPI;if([WorkbenchFileLinks]::Links($path) -gt 1){throw 'Hardlinked protection entry refused'}}
 $acl.SetAccessRuleProtection($true,$false)
 foreach($rule in @($acl.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))){$null=$acl.RemoveAccessRuleSpecific($rule)}
 if($info.directory){$rule=New-Object Security.AccessControl.FileSystemAccessRule($taskSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}else{$rule=New-Object Security.AccessControl.FileSystemAccessRule($taskSid,'FullControl','Allow')}
 $null=$acl.AddAccessRule($rule);(Get-Item -LiteralPath $path -Force).SetAccessControl($acl)
}
if($Action -eq 'status'){
 $rows=@(foreach($path in $taskRoots){if(Test-Path -LiteralPath $path){$info=Info-ACL $path;@{path=$path;private=$info.private}}else{@{path=$path;exists=$false}}})
 @{state='observed';roots=$rows} | ConvertTo-Json -Depth 4 -Compress;exit 0
}
$taskSnapshots=Join-Path $taskRoot '.runtime/permission-snapshots'
function Allowed-Target([string]$path){foreach($root in $taskRoots){if($path.Equals($root,[StringComparison]::OrdinalIgnoreCase) -or $path.StartsWith($root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){return $true}};return $false}
function Restore-Entries($entries){
 foreach($entry in @($entries | Sort-Object @{Expression={$_.path.Length};Descending=$true})){
  if(!(Allowed-Target $entry.path)){throw 'Snapshot target outside declared roots'};$null=Check-Path $entry.path
  if(!(Test-Path -LiteralPath $entry.path)){continue}
  $info=Info-ACL $entry.path
  if(!$info.directory){Load-LinkAPI;if([WorkbenchFileLinks]::Links($entry.path) -gt 1){throw 'Hardlinked restore entry refused'}}
  $info.acl.SetSecurityDescriptorSddlForm($entry.sddl,[Security.AccessControl.AccessControlSections]::Access)
  (Get-Item -LiteralPath $entry.path -Force).SetAccessControl($info.acl)
 }
}
if($Action -eq 'restore'){
 $Snapshot=Check-Path $Snapshot
 if(!$Snapshot.StartsWith($taskSnapshots+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Snapshot outside private snapshot folder'}
 $null=Info-ACL $Snapshot;$saved=Get-Content -LiteralPath $Snapshot -Raw | ConvertFrom-Json
 if($saved.version -ne 1 -or $saved.workspace -ne $taskRoot -or $saved.ownerSid -ne $taskSid.Value){throw 'Snapshot identity mismatch'}
 if($saved.dataDir -ne $DataDir -or $saved.developmentEvidence -ne $IncludeDevelopmentEvidence.IsPresent -or [bool]$saved.applicationWorkspace -ne $IncludeApplicationWorkspace.IsPresent){throw 'Snapshot scope mismatch'}
 foreach($entry in $saved.entries){if(!(Allowed-Target $entry.path)){throw 'Snapshot target outside declared roots'};$null=Check-Path $entry.path;if(Test-Path -LiteralPath $entry.path){$info=Info-ACL $entry.path;if(!$info.directory){Load-LinkAPI;if([WorkbenchFileLinks]::Links($entry.path) -gt 1){throw 'Hardlinked restore entry refused'}}}}
 Restore-Entries $saved.entries
 @{state='restored';entries=@($saved.entries).Count} | ConvertTo-Json -Compress;exit 0
}
# Healthy protected roots skip migration; new files inherit the same user-only ACL.
$pending=@(foreach($path in $taskRoots){if(Test-Path -LiteralPath $path){$info=Info-ACL $path;if(!$info.private){$path}}elseif($path -ne (Join-Path $taskRoot '.env')){$null=New-Item -ItemType Directory -Path $path -Force;$path}})
if(!$pending.Count){@{state='protected';alreadyProtected=$true;changed=0} | ConvertTo-Json -Compress;exit 0}
Load-LinkAPI
$entries=New-Object 'Collections.Generic.List[object]'
$queue=New-Object 'Collections.Generic.Queue[string]'
foreach($path in $pending){$queue.Enqueue($path)}
while($queue.Count){
 $path=$queue.Dequeue();$info=Info-ACL $path
 # Previously migrated private subtrees retain their own immutable DACL policy.
 # This keeps normal startup from scanning historical development artifacts.
 if($info.private){continue}
 if(!$info.directory -and [WorkbenchFileLinks]::Links($path) -gt 1){throw 'Hardlinked protection entry refused'}
 $entries.Add(@{path=$info.path;sddl=$info.acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)})
 if($entries.Count -gt 100000){throw 'Protection migration too large'}
 if($info.directory){foreach($item in Get-ChildItem -LiteralPath $path -Force){$queue.Enqueue($item.FullName)}}
}
# Preflight every existing entry before changing any DACL. Snapshot contains ACLs only.
$null=New-Item -ItemType Directory -Path $taskSnapshots -Force;Private-ACL $taskSnapshots
$taskSnapshot=Join-Path $taskSnapshots (([Guid]::NewGuid().ToString())+'.json')
@{version=1;workspace=$taskRoot;ownerSid=$taskSid.Value;dataDir=$DataDir;developmentEvidence=$IncludeDevelopmentEvidence.IsPresent;applicationWorkspace=$IncludeApplicationWorkspace.IsPresent;entries=@($entries.ToArray());at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskSnapshot -Encoding UTF8
Private-ACL $taskSnapshot
try{
 # Commit roots last: if the helper exits mid-migration, an unprotected root
 # still triggers recovery next start. A cached private subtree is complete.
 foreach($entry in @($entries | Sort-Object @{Expression={$_.path.Length};Descending=$true})){Private-ACL $entry.path}
 foreach($root in $pending){if(!(Info-ACL $root).private){throw 'Protection verification failed'}}
}catch{try{Restore-Entries $entries.ToArray()}catch{throw 'Permission change failed and ACL restore failed; inspect private snapshot'};throw}
@{state='protected';alreadyProtected=$false;changed=$entries.Count;snapshot=$taskSnapshot} | ConvertTo-Json -Compress

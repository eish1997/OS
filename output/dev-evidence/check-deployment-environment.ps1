$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath '.').Path
$taskOS=Get-CimInstance Win32_OperatingSystem
$taskComputer=Get-CimInstance Win32_ComputerSystem
$taskIdentity=[Security.Principal.WindowsIdentity]::GetCurrent()
$taskPrincipal=New-Object Security.Principal.WindowsPrincipal($taskIdentity)
$taskCommands=foreach($taskName in @('docker','podman','wsl','WindowsSandbox','tailscale','cloudflared','ssh','VBoxManage')){
 $taskCommand=Get-Command $taskName -ErrorAction SilentlyContinue
 [pscustomobject]@{name=$taskName;available=($null -ne $taskCommand)}
}
$taskACLs=foreach($taskTarget in @('.env','data','data/private-model','.runtime','output/dev-evidence/private')){
 $taskPath=Join-Path $taskRoot $taskTarget
 if(Test-Path -LiteralPath $taskPath){
  $taskACL=Get-Acl -LiteralPath $taskPath
  $taskBroad=@($taskACL.Access | Where-Object {
   try{$taskSid=$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;$taskSid -in @('S-1-1-0','S-1-5-11','S-1-5-32-545')}catch{$false}
  } | ForEach-Object {[pscustomobject]@{principal=$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;rights=$_.FileSystemRights.ToString();type=$_.AccessControlType.ToString();inherited=$_.IsInherited}})
  [pscustomobject]@{path=$taskTarget;inheritanceProtected=$taskACL.AreAccessRulesProtected;ownedByCurrentUser=($taskACL.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $taskIdentity.User.Value);broadRules=$taskBroad}
 }
}
$taskServices=@(Get-Service -Name '*docker*','*vmcompute*','*Lxss*','*Wsl*','*tailscale*','*cloudflared*' -ErrorAction SilentlyContinue | ForEach-Object {[pscustomobject]@{name=$_.Name;status=$_.Status.ToString()}})
$taskDistros=@(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss' -ErrorAction SilentlyContinue)
$taskReport=[pscustomobject]@{
 at=[DateTime]::UtcNow.ToString('o');status='observed';os=$taskOS.Caption;version=$taskOS.Version
 edition=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').EditionID
 administrator=$taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 hypervisorPresent=$taskComputer.HypervisorPresent
 virtualization=@(Get-CimInstance Win32_Processor | Select-Object VirtualizationFirmwareEnabled,SecondLevelAddressTranslationExtensions)
 sandboxExecutable=(Test-Path -LiteralPath 'C:\Windows\System32\WindowsSandbox.exe')
 commands=@($taskCommands);services=$taskServices;registeredWslDistributions=$taskDistros.Count;acls=@($taskACLs)
 modelRequests=0;changedOS=$false;changedPermissions=$false;executedDownloadedCode=$false
 limitations=@('PATH/known-service/registry inventory cannot prove no manually installed VM elsewhere','No OS sleep or reboot tested','ACL observation is not a different-user access test or full production isolation')
}
$taskReport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $taskRoot 'output/dev-evidence/deployment-environment.json') -Encoding UTF8
[pscustomobject]@{status='observed';sandbox=$taskReport.sandboxExecutable;wslDistributions=$taskDistros.Count;administrator=$taskReport.administrator;modelRequests=0;aclTargets=$taskACLs.Count} | ConvertTo-Json -Compress

param(
  [ValidateSet('create','status','remove')][string]$Action='status',
  [string]$ShortcutDir='', [string]$StartupDir='',
  [ValidatePattern('^[a-zA-Z0-9-]{1,40}$')][string]$Name='workbench',
  [ValidateRange(1,65535)][int]$Port=4310,
  [string]$DataDir='', [string]$Origin=''
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (!$ShortcutDir) { $ShortcutDir=$taskRoot }
if (!$StartupDir) { $StartupDir=[Environment]::GetFolderPath('Startup') }
if (!$StartupDir) { throw 'Current-user startup folder is unavailable' }
foreach ($taskArgument in @($taskRoot,$ShortcutDir,$StartupDir,$DataDir,$Origin)) { if ($taskArgument.Contains('"')) { throw 'Invalid shortcut argument' } }
$taskShortcutRoot=[IO.Path]::GetFullPath($ShortcutDir);$taskStartupRoot=[IO.Path]::GetFullPath($StartupDir)
foreach ($taskFolder in @($taskShortcutRoot,$taskStartupRoot)) {
  if (!(Test-Path -LiteralPath $taskFolder -PathType Container)) { throw 'Shortcut folder is unavailable' }
  if ((Get-Item -LiteralPath $taskFolder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Shortcut folder is a link' }
}
$taskHash=[Security.Cryptography.SHA256]::Create()
try { $taskKey=[BitConverter]::ToString($taskHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskRoot+'|'+$Name))).Replace('-','').ToLowerInvariant() } finally { $taskHash.Dispose() }
$taskExtra=' -Name '+$Name+' -Port '+$Port
if ($DataDir) { $taskExtra+=' -DataDir "'+$DataDir+'"' };if ($Origin) { $taskExtra+=' -Origin "'+$Origin+'"' }
$taskDefinitions=@(
  @{kind='open';path=(Join-Path $taskShortcutRoot '打开工作台.lnk');arguments=('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'open-workbench.ps1')+'"'+$taskExtra);description=('AIOS owned open | '+$taskKey)},
  @{kind='startup';path=(Join-Path $taskStartupRoot ('AIOS-'+$taskKey.Substring(0,12)+'.lnk'));arguments=('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'supervise-service.ps1')+'" -Action start'+$taskExtra);description=('AIOS owned startup | '+$taskKey)}
)
$taskCom=New-Object -ComObject WScript.Shell
function Read-Shortcut($definition) {
  if (!(Test-Path -LiteralPath $definition.path)) { return @{kind=$definition.kind;path=$definition.path;exists=$false;owned=$false} }
  if ((Get-Item -LiteralPath $definition.path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Shortcut is a link; no file changed' }
  $taskLink=$taskCom.CreateShortcut($definition.path)
  try {
    $taskOwned=($taskLink.TargetPath -eq $taskShell -and $taskLink.Arguments -eq $definition.arguments -and $taskLink.WorkingDirectory -eq $taskRoot -and $taskLink.Description -eq $definition.description -and $taskLink.WindowStyle -eq 7)
    return @{kind=$definition.kind;path=$definition.path;exists=$true;owned=$taskOwned;target=$taskLink.TargetPath;arguments=$taskLink.Arguments;windowStyle=$taskLink.WindowStyle}
  } finally { $null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskLink) }
}
try {
  # Verify every destination before any overwrite/removal. Never replace a
  # shortcut belonging to another app, even at our expected filename.
  $taskExisting=@($taskDefinitions | ForEach-Object { Read-Shortcut $_ })
  if ($Action -ne 'status') { foreach ($taskItem in $taskExisting) { if ($taskItem.exists -and !$taskItem.owned) { throw 'Shortcut ownership mismatch; no file changed' } } }
  if ($Action -eq 'create') {
    foreach ($taskDefinition in $taskDefinitions) {
      $taskTemp=$taskDefinition.path+'.'+[Guid]::NewGuid().ToString()+'.lnk'
      $taskLink=$taskCom.CreateShortcut($taskTemp)
      try { $taskLink.TargetPath=$taskShell;$taskLink.Arguments=$taskDefinition.arguments;$taskLink.WorkingDirectory=$taskRoot;$taskLink.Description=$taskDefinition.description;$taskLink.WindowStyle=7;$taskLink.Save() } finally { $null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskLink) }
      Move-Item -LiteralPath $taskTemp -Destination $taskDefinition.path -Force
    }
  } elseif ($Action -eq 'remove') { foreach ($taskDefinition in $taskDefinitions) { if (Test-Path -LiteralPath $taskDefinition.path) { Remove-Item -LiteralPath $taskDefinition.path } } }
  $taskResult=@($taskDefinitions | ForEach-Object { Read-Shortcut $_ })
  if ($Action -eq 'create' -and @($taskResult | Where-Object { !$_.owned }).Count) { throw 'Shortcut verification failed' }
  @{action=$Action;workspace=$taskRoot;name=$Name;entries=$taskResult;startupConfigured=(@($taskResult | Where-Object { $_.kind -eq 'startup' -and $_.owned }).Count -eq 1)} | ConvertTo-Json -Depth 6 -Compress
} finally { $null=[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskCom) }

param(
  [ValidatePattern('^[a-zA-Z0-9-]{1,40}$')][string]$Name='workbench',
  [ValidateRange(1,65535)][int]$Port=4310,
  [string]$DataDir='', [string]$Origin='', [switch]$NoBrowser
)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskArgs=@{Action='start';Name=$Name;Port=$Port;DataDir=$DataDir;Origin=$Origin}
try {
  $null=& (Join-Path $PSScriptRoot 'supervise-service.ps1') @taskArgs
  $taskStatusArgs=@{Action='status';Name=$Name;Port=$Port;DataDir=$DataDir;Origin=$Origin}
  $taskService=(& (Join-Path $PSScriptRoot 'local-service.ps1') @taskStatusArgs) | ConvertFrom-Json
  if ($taskService.state -ne 'ready') { throw 'Workbench is not ready; its owned process was retained' }
  $taskUri=[Uri]$taskService.url
  if ($taskUri.Scheme -ne 'http' -or $taskUri.Host -ne '127.0.0.1' -or $taskUri.Port -ne $Port) { throw 'Unexpected local workbench address' }
  if (!$NoBrowser) { $null=Start-Process -FilePath $taskService.url }
  @{state='ready';url=$taskService.url;servicePid=$taskService.pid;browserRequested=(!$NoBrowser)} | ConvertTo-Json -Compress
} catch {
  if (!$NoBrowser) {
    # User-facing startup errors must remain visible with a hidden launcher.
    Add-Type -AssemblyName System.Windows.Forms
    $null=[Windows.Forms.MessageBox]::Show('工作台暂时没有启动成功。请保留现有数据，查看 .runtime 中的启动记录。','Studio AI 工作台')
  }
  throw
}

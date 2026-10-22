param(
  [ValidateSet('start','status','stop')][string]$Action='status',
  [ValidatePattern('^[a-zA-Z0-9-]{1,40}$')][string]$Name='workbench',
  [ValidateRange(1,65535)][int]$Port=4310,
  [string]$DataDir='',
  [string]$Origin='',
  [switch]$UnexpectedExitOnly
)
$ErrorActionPreference='Stop'
$taskWorkspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskFolder=Join-Path $taskWorkspace '.runtime'
$taskManifest=Join-Path $taskFolder ('local-service-'+$Name+'.json')
$taskEntry=Join-Path $taskWorkspace 'server\index.ts'
function Creation-Stamp($record) { return ([DateTime]$record.creationUtc).ToUniversalTime().ToString('o') }
function Matches-OwnedIdentity($taskProcess,$record) {
  return ($taskProcess.ExecutablePath -eq $record.executable -and $taskProcess.CreationDate.ToUniversalTime().ToString('o') -eq (Creation-Stamp $record) -and $taskProcess.CommandLine -and $taskProcess.CommandLine.Contains($taskEntry) -and $taskProcess.CommandLine.Contains('--service-instance '+$record.launchId))
}
function Find-OwnedProcess($record) {
  if (-not $record -or $record.pid -notmatch '^\d+$') { throw 'Invalid service manifest' }
  $taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
  if (-not $taskProcess) { return $null }
  if (!(Matches-OwnedIdentity $taskProcess $record)) {
    # CIM can observe a terminating process after its command line/image have
    # disappeared. Re-read the actual process before reporting a conflict;
    # only absence proves exit. A live foreign identity still refuses control.
    $taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
    if (!$taskProcess) { return $null }
    if (!(Matches-OwnedIdentity $taskProcess $record)) { throw 'PID ownership mismatch; no process was stopped' }
  }
  return $taskProcess
}
function Get-Health($record) {
  $taskHealth=Invoke-RestMethod -UseBasicParsing -Uri ($record.url+'/api/health') -TimeoutSec 2
  if ($taskHealth.pid -ne $record.pid -or $taskHealth.launchId -ne $record.launchId) { throw 'Service identity mismatch; no credentials were sent' }
  return $taskHealth
}
function Read-Setting([string]$key) {
  $taskValue=[Environment]::GetEnvironmentVariable($key,'Process')
  if ($null -ne $taskValue) { return $taskValue }
  $taskEnv=Join-Path $taskWorkspace '.env'
  if (Test-Path -LiteralPath $taskEnv) { foreach ($line in Get-Content -LiteralPath $taskEnv) { if ($line.StartsWith($key+'=')) { return $line.Substring($key.Length+1).Trim([char]34,[char]39) } } }
  return ''
}
$taskRecord=$null
if (Test-Path -LiteralPath $taskManifest) { $taskRecord=Get-Content -LiteralPath $taskManifest -Raw | ConvertFrom-Json }
$taskOwned=if ($taskRecord -and -not $taskRecord.stoppedAt) { Find-OwnedProcess $taskRecord } else { $null }
if ($Action -eq 'start' -and $UnexpectedExitOnly -and $taskRecord -and ($taskRecord.stopRequestedAt -or $taskRecord.stoppedAt)) { throw 'Service was deliberately stopped; no restart attempted' }
if ($Action -eq 'status') {
  if (-not $taskOwned) { @{state='stopped';name=$Name} | ConvertTo-Json -Compress; exit 0 }
  $taskHealth=Get-Health $taskRecord
  @{state=if($taskHealth.ready){'ready'}else{'stopping'};name=$Name;pid=$taskRecord.pid;url=$taskRecord.url;instanceId=$taskHealth.instanceId;creationUtc=$taskRecord.creationUtc;workspace=$taskWorkspace} | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'stop') {
  if (-not $taskOwned) { @{state='stopped';name=$Name} | ConvertTo-Json -Compress; exit 0 }
  $taskHealth=Get-Health $taskRecord
  $taskPassword=Read-Setting 'WORKBENCH_PASSWORD'
  if (-not $taskPassword) { throw 'Login password is not configured; service was not stopped' }
  Add-Type -AssemblyName System.Net.Http
  $taskHandler=[System.Net.Http.HttpClientHandler]::new(); $taskHandler.UseCookies=$false
  $taskClient=[System.Net.Http.HttpClient]::new($taskHandler); $taskClient.Timeout=[TimeSpan]::FromSeconds(5)
  $taskCookie=''
  try {
    $taskContent=[System.Net.Http.StringContent]::new((@{password=$taskPassword}|ConvertTo-Json -Compress),[Text.Encoding]::UTF8,'application/json')
    $taskLogin=$taskClient.PostAsync($taskRecord.url+'/api/login',$taskContent).GetAwaiter().GetResult()
    if (-not $taskLogin.IsSuccessStatusCode) { throw 'Login rejected' }
    $taskCookie=(@($taskLogin.Headers.GetValues('Set-Cookie'))[0] -split ';')[0]
    $null=$taskClient.DefaultRequestHeaders.TryAddWithoutValidation('Cookie',$taskCookie)
    $taskContent=[System.Net.Http.StringContent]::new((@{instanceId=$taskHealth.instanceId;ephemeralSession=$true}|ConvertTo-Json -Compress),[Text.Encoding]::UTF8,'application/json')
    $taskResponse=$taskClient.PostAsync($taskRecord.url+'/api/service/shutdown',$taskContent).GetAwaiter().GetResult()
    if ([int]$taskResponse.StatusCode -ne 202) { throw 'Shutdown rejected' }
    # Publish authenticated stop intent before the process exits. A supervisor
    # must distinguish this deliberate shutdown from an unexpected crash.
    $taskRecord | Add-Member -NotePropertyName stopRequestedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
    $taskRecord | ConvertTo-Json | Set-Content -LiteralPath $taskManifest -Encoding UTF8
  } catch { throw 'Authenticated graceful shutdown failed; no force stop attempted' } finally {
    # Also clean up a rejected stop or an older server that does not yet retire
    # ephemeral sessions. This cookie belongs only to this launcher invocation.
    if ($taskCookie) { try {
      $taskLogoutContent=[System.Net.Http.StringContent]::new('{}',[Text.Encoding]::UTF8,'application/json')
      $null=$taskClient.PostAsync($taskRecord.url+'/api/logout',$taskLogoutContent).GetAwaiter().GetResult()
    } catch {} }
    $taskClient.Dispose(); $taskHandler.Dispose()
  }
  # Background backup has a 180-second bound; allow its owned process to drain
  # before confirming shutdown. Never turn a slow stop into a force kill.
  $taskDeadline=[DateTime]::UtcNow.AddSeconds(190)
  while ([DateTime]::UtcNow -lt $taskDeadline) {
    $taskRemaining=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$taskRecord.pid)
    if (-not $taskRemaining -or $taskRemaining.CreationDate.ToUniversalTime().ToString('o') -ne (Creation-Stamp $taskRecord)) {
      $taskRecord | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
      $taskRecord | ConvertTo-Json | Set-Content -LiteralPath $taskManifest -Encoding UTF8
      @{state='stopped';name=$Name;pid=$taskRecord.pid} | ConvertTo-Json -Compress; exit 0
    }
    Start-Sleep -Milliseconds 200
  }
  throw 'Graceful shutdown did not finish; inspect the owned service before retrying'
}
if ($taskOwned) { $taskHealth=Get-Health $taskRecord; @{state='ready';name=$Name;pid=$taskRecord.pid;url=$taskRecord.url;instanceId=$taskHealth.instanceId;alreadyRunning=$true} | ConvertTo-Json -Compress; exit 0 }
$taskUrl='http://127.0.0.1:'+$Port
$taskListener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$Port)
try { $taskListener.Start() } catch { throw 'Port is occupied; no process was changed' } finally { $taskListener.Stop() }
$taskRuntime=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskCandidate=(Get-Command node -ErrorAction SilentlyContinue).Source
# Prefer the newest Node 24+ among bundled runtime and PATH; PATH-only 24.5 lacks setGlobalProxyFromEnv (needs 24.14+).
function Get-NodeScore([string]$exe) {
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { return -1 }
  $parts=(& $exe --version).TrimStart('v').Split('.')
  return ([int64]$parts[0]*1000000)+([int64]$parts[1]*1000)+[int64]$parts[2]
}
$taskChoices=@()
if ((Get-NodeScore $taskRuntime) -ge 0) { $taskChoices += @{ path=$taskRuntime; score=(Get-NodeScore $taskRuntime) } }
if ($taskCandidate -and (Get-NodeScore $taskCandidate) -ge 0) { $taskChoices += @{ path=$taskCandidate; score=(Get-NodeScore $taskCandidate) } }
$taskBest=$taskChoices | Sort-Object { $_.score } -Descending | Select-Object -First 1
if (-not $taskBest -or $taskBest.score -lt 24000000) { throw 'Node.js 24+ is required' }
$taskRuntime=$taskBest.path
if (-not $DataDir) { $DataDir=Read-Setting 'DATA_DIR'; if (-not $DataDir) { $DataDir=Join-Path $taskWorkspace 'data' } }
if (-not [IO.Path]::IsPathRooted($DataDir)) { $DataDir=Join-Path $taskWorkspace $DataDir }
if (-not $Origin) { $Origin=Read-Setting 'PUBLIC_ORIGIN'; if (-not $Origin) { $Origin=$taskUrl } }
$taskLaunch=[Guid]::NewGuid().ToString()
$null=New-Item -ItemType Directory -Path $taskFolder -Force
$taskLoader=([Uri](Join-Path $taskWorkspace 'node_modules\tsx\dist\loader.mjs')).AbsoluteUri
$taskSaved=@{}
foreach ($key in @('PORT','DATA_DIR','PUBLIC_ORIGIN')) { $taskSaved[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
try {
  $env:PORT=[string]$Port; $env:DATA_DIR=[IO.Path]::GetFullPath($DataDir); $env:PUBLIC_ORIGIN=$Origin
  $taskChild=Start-Process -FilePath $taskRuntime -ArgumentList @('--import',$taskLoader,('"'+$taskEntry+'"'),'--service-instance',$taskLaunch) -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskFolder ($Name+'.stdout.log')) -RedirectStandardError (Join-Path $taskFolder ($Name+'.stderr.log')) -PassThru
} finally { foreach ($key in $taskSaved.Keys) { [Environment]::SetEnvironmentVariable($key,$taskSaved[$key],'Process') } }
$taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$taskChild.Id)
if (-not $taskProcess) { throw 'Service exited before registration; inspect local logs' }
$taskRecord=@{pid=$taskChild.Id;creationUtc=$taskProcess.CreationDate.ToUniversalTime().ToString('o');executable=$taskProcess.ExecutablePath;workspace=$taskWorkspace;entry=$taskEntry;launchId=$taskLaunch;url=$taskUrl;port=$Port;dataDir=[IO.Path]::GetFullPath($DataDir);startedAt=[DateTime]::UtcNow.ToString('o');owner='local-service.ps1';commandSummary='Node24 tsx server/index.ts --service-instance UUID';kind='local product service'}
$taskRecord | ConvertTo-Json | Set-Content -LiteralPath $taskManifest -Encoding UTF8
$taskDeadline=[DateTime]::UtcNow.AddSeconds(15)
while ([DateTime]::UtcNow -lt $taskDeadline) {
  if (-not (Find-OwnedProcess $taskRecord)) { throw 'Service exited; inspect local logs' }
  try { $taskHealth=Get-Health $taskRecord; if ($taskHealth.ready) { @{state='ready';name=$Name;pid=$taskRecord.pid;url=$taskRecord.url;instanceId=$taskHealth.instanceId;manifest=$taskManifest} | ConvertTo-Json -Compress; exit 0 } } catch {}
  Start-Sleep -Milliseconds 200
}
throw 'Service readiness timed out; owned manifest retained for inspection'

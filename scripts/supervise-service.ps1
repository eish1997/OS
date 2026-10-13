param(
  [ValidateSet('start','run','status','stop')][string]$Action='status',
  [ValidatePattern('^[a-zA-Z0-9-]{1,40}$')][string]$Name='workbench',
  [ValidateRange(1,65535)][int]$Port=4310,
  [string]$DataDir='', [string]$Origin='',
  [ValidateRange(1000,60000)][int]$IntervalMs=15000,
  [ValidateRange(1,10)][int]$MaxRestarts=5,
  [string]$Instance=''
)
$ErrorActionPreference='Stop'
$taskWorkspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskEntry=Join-Path $taskWorkspace 'scripts\supervise-service.ps1'
$taskManager=Join-Path $taskWorkspace 'scripts\local-service.ps1'
$taskFolder=Join-Path $taskWorkspace '.runtime'
$taskProfile=Join-Path $taskFolder ('supervisor-'+$Name+'.json')
$taskStop=Join-Path $taskFolder ('supervisor-'+$Name+'.stop.json')
$taskServiceProfile=Join-Path $taskFolder ('local-service-'+$Name+'.json')
$taskShell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if ($DataDir.Contains('"') -or $Origin.Contains('"')) { throw 'Invalid launcher argument' }
foreach ($taskPath in @($taskFolder,$taskProfile,$taskStop)) {
  if ((Test-Path -LiteralPath $taskPath) -and ((Get-Item -LiteralPath $taskPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Supervisor path is a link; no process changed' }
}
$null=New-Item -ItemType Directory -Path $taskFolder -Force
function Read-Record([string]$path) {
  if (!(Test-Path -LiteralPath $path)) { return $null }
  if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Supervisor record is oversized' }
  return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
}
function Matches-SupervisorIdentity($taskProcess,$record) {
  return ($taskProcess.ExecutablePath -eq $record.executable -and $taskProcess.CreationDate.ToUniversalTime().ToString('o') -eq ([DateTime]$record.creationUtc).ToUniversalTime().ToString('o') -and $taskProcess.CommandLine -and $taskProcess.CommandLine.Contains($taskEntry) -and $taskProcess.CommandLine.Contains('-Instance '+$record.instance))
}
function Find-Supervisor($record) {
  if (!$record -or $record.stoppedAt) { return $null }
  if ($record.owner -ne 'supervise-service.ps1' -or $record.workspace -ne $taskWorkspace -or $record.name -ne $Name -or $record.pid -notmatch '^\d+$') { throw 'Supervisor ownership mismatch; no process changed' }
  $taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
  if (!$taskProcess) { return $null }
  if (!(Matches-SupervisorIdentity $taskProcess $record)) {
    $taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$record.pid)
    if (!$taskProcess) { return $null }
    if (!(Matches-SupervisorIdentity $taskProcess $record)) { throw 'Supervisor identity mismatch; no process changed' }
  }
  return $taskProcess
}
function Manager([string]$operation) {
  $taskParameters=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$taskManager,'-Action',$operation,'-Name',$Name,'-Port',[string]$Port)
  if ($DataDir) { $taskParameters+=@('-DataDir',$DataDir) }; if ($Origin) { $taskParameters+=@('-Origin',$Origin) }
  if ($operation -eq 'start' -and !$taskFirst) { $taskParameters+='-UnexpectedExitOnly' }
  # Windows PowerShell's native pipeline can wait for descendants of the
  # launcher, including the detached long-lived Node service. Wait for the
  # actual manager Process handle instead, and read its two streams in parallel.
  $taskInfo=[Diagnostics.ProcessStartInfo]::new()
  $taskInfo.FileName=$taskShell;$taskInfo.UseShellExecute=$false;$taskInfo.CreateNoWindow=$true
  $taskInfo.RedirectStandardOutput=$true;$taskInfo.RedirectStandardError=$true
  $taskInfo.Arguments=($taskParameters | ForEach-Object { '"'+[regex]::Replace($_,'(\\+)$','$1$1')+'"' }) -join ' '
  $taskCommand=[Diagnostics.Process]::new();$taskCommand.StartInfo=$taskInfo
  try {
    $null=$taskCommand.Start()
    # Detached descendants can inherit extra pipe handles. EOF is not the
    # completion signal: require the one-line JSON receipt AND actual manager
    # exit, rather than waiting for the long-lived service to close every pipe.
    $taskOut=$taskCommand.StandardOutput.ReadLineAsync();$taskErr=$taskCommand.StandardError.ReadLineAsync()
    while (!$taskCommand.WaitForExit(1000)) { }
    $taskCode=$taskCommand.ExitCode;$taskOutput='';$taskError=''
    if ($taskCode -eq 0) {
      if (!$taskOut.Wait(2000)) { throw 'managed-receipt-unavailable' }
      $taskOutput=$taskOut.GetAwaiter().GetResult()
    } elseif ($taskErr.Wait(2000)) { $taskError=$taskErr.GetAwaiter().GetResult() }
  } finally { $taskCommand.Dispose() }
  if ($taskCode -ne 0) {
    if (($taskOutput+$taskError) -match 'ownership mismatch|identity mismatch') { throw 'managed-identity-conflict' }
    throw ('managed-'+$operation+'-unavailable')
  }
  return $taskOutput.Trim() | ConvertFrom-Json
}
function Write-Record($record) {
  $taskTemporary=$taskProfile+'.'+$record.instance+'.tmp'
  $record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskTemporary -Encoding UTF8
  Move-Item -LiteralPath $taskTemporary -Destination $taskProfile -Force
}
function Same-CreationInstant($left,$right) {
  # JSON consumers can change fractional precision or UTC offset spelling.
  # Compare instants while retaining PID and launch-instance requirements.
  try {
    return ([DateTimeOffset]$left).UtcTicks -eq ([DateTimeOffset]$right).UtcTicks
  } catch { return $false }
}
$taskRecord=Read-Record $taskProfile
$taskOwned=Find-Supervisor $taskRecord
if ($Action -eq 'status') {
  @{name=$Name;running=[bool]$taskOwned;state=if($taskOwned){$taskRecord.state}else{'stopped'};pid=if($taskOwned){$taskRecord.pid}else{$null};instance=if($taskOwned){$taskRecord.instance}else{$null};restartCount=if($taskRecord){$taskRecord.restartCount}else{0};lastError=if($taskRecord){$taskRecord.lastError}else{$null}} | ConvertTo-Json -Compress
  exit 0
}
if ($Action -eq 'stop') {
  if (!$taskOwned) { @{name=$Name;state='stopped'} | ConvertTo-Json -Compress; exit 0 }
  @{instance=$taskRecord.instance;pid=$taskRecord.pid;creationUtc=$taskRecord.creationUtc} | ConvertTo-Json | Set-Content -LiteralPath $taskStop -Encoding UTF8
  $taskDeadline=[DateTime]::UtcNow.AddSeconds(70)
  while ([DateTime]::UtcNow -lt $taskDeadline) {
    if (!(Find-Supervisor $taskRecord)) {
      $taskLatest=Read-Record $taskProfile
      if ($taskLatest -and $taskLatest.instance -eq $taskRecord.instance) { $taskLatest | Add-Member -NotePropertyName stoppedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force;Write-Record $taskLatest }
      @{name=$Name;state='stopped';serviceLeftRunning=$true} | ConvertTo-Json -Compress; exit 0
    }
    Start-Sleep -Milliseconds 200
  }
  throw 'Supervisor stop is pending; no force stop attempted'
}
if ($Action -eq 'start') {
  if ($taskOwned) { @{name=$Name;state=$taskRecord.state;pid=$taskRecord.pid;alreadyRunning=$true} | ConvertTo-Json -Compress; exit 0 }
  $taskLaunch=[Guid]::NewGuid().ToString()
  $taskArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$taskEntry+'"'),'-Action','run','-Name',$Name,'-Port',[string]$Port,'-IntervalMs',[string]$IntervalMs,'-MaxRestarts',[string]$MaxRestarts,'-Instance',$taskLaunch)
  if ($DataDir) { $taskArgs+=@('-DataDir',('"'+$DataDir+'"')) }; if ($Origin) { $taskArgs+=@('-Origin',('"'+$Origin+'"')) }
  $taskChild=Start-Process -FilePath $taskShell -ArgumentList $taskArgs -WorkingDirectory $taskWorkspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskFolder ('supervisor-'+$Name+'.stdout.log')) -RedirectStandardError (Join-Path $taskFolder ('supervisor-'+$Name+'.stderr.log')) -PassThru
  $taskDeadline=[DateTime]::UtcNow.AddSeconds(30)
  while ([DateTime]::UtcNow -lt $taskDeadline) {
    $taskLatest=Read-Record $taskProfile
    if ($taskLatest -and (Find-Supervisor $taskLatest) -and $taskLatest.state -eq 'ready') { @{name=$Name;state='ready';pid=$taskLatest.pid;instance=$taskLatest.instance;servicePid=$taskLatest.servicePid} | ConvertTo-Json -Compress; exit 0 }
    if ($taskChild.HasExited) { throw 'Supervisor exited during startup; inspect its owned record' }
    Start-Sleep -Milliseconds 200
  }
  throw 'Supervisor readiness is pending; owned process retained, no restart attempted'
}
if (!$Instance -or $Instance -notmatch '^[a-fA-F0-9-]{36}$') { throw 'An owned run needs a launch instance' }
$taskHash=[Security.Cryptography.SHA256]::Create()
try { $taskKey=[BitConverter]::ToString($taskHash.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskWorkspace+'|'+$Name))).Replace('-','') } finally { $taskHash.Dispose() }
$taskMutex=[Threading.Mutex]::new($false,('Local\AIOS-Supervisor-'+$taskKey))
$taskAcquired=$false
try {
  try { $taskAcquired=$taskMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $taskAcquired=$true }
  if (!$taskAcquired) { throw 'An owned supervisor already holds this service' }
  $taskExisting=Read-Record $taskProfile
  if ($taskExisting -and (Find-Supervisor $taskExisting)) { throw 'An owned supervisor is already running' }
  $taskSelf=Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)
  $taskState=@{owner='supervise-service.ps1';name=$Name;workspace=$taskWorkspace;entry=$taskEntry;pid=$PID;creationUtc=$taskSelf.CreationDate.ToUniversalTime().ToString('o');executable=$taskSelf.ExecutablePath;instance=$Instance;state='starting';restartCount=0;recentRestartAttempts=0;checks=0;intervalMs=$IntervalMs;maxRestarts=$MaxRestarts;servicePid=$null;lastError=$null;at=[DateTime]::UtcNow.ToString('o')}
  Write-Record $taskState
  $taskAttempts=@();$taskFirst=$true
  while ($true) {
    $taskRequest=Read-Record $taskStop
    if ($taskRequest -and $taskRequest.instance -eq $Instance -and $taskRequest.pid -eq $PID -and (Same-CreationInstant $taskRequest.creationUtc $taskState.creationUtc)) { $taskState.state='stopped-by-request'; break }
    $taskService=Read-Record $taskServiceProfile
    if (!$taskFirst -and $taskService -and ($taskService.stopRequestedAt -or $taskService.stoppedAt)) { $taskState.state='stopped-by-user'; break }
    $taskState.checks++;$taskState.at=[DateTime]::UtcNow.ToString('o')
    try {
      $taskStatus=Manager 'status'
      if ($taskStatus.state -eq 'stopped') {
        # Only this identity-checking status result proves the service process
        # absent. Failed health requests never authorize a restart or a kill.
        $taskAttempts=@($taskAttempts | Where-Object { $_ -gt [DateTime]::UtcNow.AddMinutes(-10) })
        if ($taskAttempts.Count -ge $MaxRestarts) { $taskState.state='restart-limit'; break }
        $taskAttempts+=,[DateTime]::UtcNow
        $taskState.recentRestartAttempts=$taskAttempts.Count
        $taskState.state='restarting';Write-Record $taskState
        $taskStatus=Manager 'start'
        if (!$taskFirst) { $taskState.restartCount++ }
      }
      $taskState.state=if($taskStatus.state -eq 'ready'){'ready'}else{'waiting-health'}
      $taskState.servicePid=$taskStatus.pid;$taskState.lastError=$null
    } catch {
      $taskState.lastError=$_.Exception.Message
      if ($taskState.lastError -eq 'managed-identity-conflict') { $taskState.state='identity-conflict'; break }
      $taskState.state='waiting-health'
    }
    $taskFirst=$false;Write-Record $taskState
    Start-Sleep -Milliseconds $IntervalMs
  }
} finally {
  if ($taskAcquired) {
    # Committing exit is not proof that this process is already absent. The
    # external stop caller records stoppedAt only after actual identity lookup.
    if ($taskState) { $taskState.stopCommittedAt=[DateTime]::UtcNow.ToString('o');Write-Record $taskState }
    $taskMutex.ReleaseMutex()
  }
  $taskMutex.Dispose()
}

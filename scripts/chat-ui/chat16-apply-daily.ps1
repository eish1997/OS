# CHAT-16: apply chat-ui candidate to F:\AI\OS daily service.
# Preserves .env and data/. Does not print secrets. No git.
param(
  [string]$DailyRoot = 'F:\AI\OS',
  [string]$Worktree = '',
  [string]$Evidence = ''
)
$ErrorActionPreference = 'Stop'
if (-not $Worktree) { $Worktree = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
if (-not $Evidence) { $Evidence = Join-Path $Worktree 'output\dev-evidence\chat-ui\loop-001' }
$Candidate = Join-Path $Worktree 'output\chat-ui-build'
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = [ordered]@{
  at = (Get-Date).ToUniversalTime().ToString('o')
  dailyRoot = $DailyRoot
  worktree = $Worktree
  candidate = $Candidate
  stamp = $stamp
}

function Read-EnvPassword([string]$root) {
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path -LiteralPath $envFile)) { throw '.env missing on daily root' }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^WORKBENCH_PASSWORD=(.*)$') {
      return $Matches[1].Trim([char]34, [char]39)
    }
  }
  throw 'WORKBENCH_PASSWORD not found'
}

function New-AuthSession([string]$base, [string]$password) {
  $session = $null
  $resp = Invoke-WebRequest -Uri ($base + '/api/login') -Method POST -ContentType 'application/json' -Body ((@{ password = $password } | ConvertTo-Json -Compress)) -SessionVariable session -UseBasicParsing
  if ($resp.StatusCode -ne 200) { throw 'login failed' }
  return $session
}

function Snapshot-Business([string]$base, $session) {
  $snap = Invoke-RestMethod -Uri ($base + '/api/snapshot') -WebSession $session
  $diag = Invoke-RestMethod -Uri ($base + '/api/diagnostics') -WebSession $session
  $kinds = @('projects','summaries','tasks','assets','memories','drafts','inbox','operations')
  $collections = @{}
  foreach ($k in $kinds) {
    $items = @($snap.$k)
    $payload = ($items | ConvertTo-Json -Compress -Depth 6)
    if (-not $payload) { $payload = '[]' }
    $hash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))).Replace('-','').ToLowerInvariant()
    $collections[$k] = @{ count = $items.Count; digest = $hash }
  }
  $active = @($snap.runs | Where-Object { $_.status -in @('queued','running','waiting_interaction','waiting_user','waiting_node') })
  $backupStatus = $null
  try { $backupStatus = Invoke-RestMethod -Uri ($base + '/api/backup/status') -WebSession $session } catch { }
  return @{
    health = @{ ready = $true; pid = $diag.service.pid; instanceId = $diag.service.instanceId; launchId = $diag.service.launchId }
    collections = $collections
    activeRuns = @($active | ForEach-Object { @{ id = $_.id; status = $_.status; mode = $_.mode } })
    modelConfigured = $snap.config.modelConfigured
    model = $snap.config.model
    backupStatus = $backupStatus
  }
}

if (-not (Test-Path -LiteralPath $Candidate)) { throw "candidate missing: $Candidate" }
if (-not (Test-Path -LiteralPath (Join-Path $DailyRoot 'dist'))) { throw "daily dist missing" }

$base = 'http://127.0.0.1:4310'
$password = Read-EnvPassword $DailyRoot
$session = New-AuthSession $base $password
$before = Snapshot-Business $base $session
$report.before = $before
$report.before | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Evidence "chat16-before-$stamp.json") -Encoding UTF8

if (@($before.activeRuns).Count -gt 0) {
  $report.blocked = 'active-runs'
  $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Evidence 'chat16-report.json') -Encoding UTF8
  throw "Active runs present; refuse apply: $($before.activeRuns | ConvertTo-Json -Compress)"
}

# Layered backup: dist + (after stop) data sqlite copy. .env never copied into evidence.
$backupRoot = Join-Path $env:USERPROFILE "AI-OS-Backups\chat16-$stamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$distBackup = Join-Path $backupRoot 'dist'
Copy-Item -LiteralPath (Join-Path $DailyRoot 'dist') -Destination $distBackup -Recurse -Force
$report.backupRoot = $backupRoot
$report.distBackup = $distBackup
$report.candidateAppJs = (Get-ChildItem (Join-Path $Candidate 'assets\app-*.js') | Select-Object -First 1 -ExpandProperty Name)
$report.dailyAppJsBefore = (Get-ChildItem (Join-Path $DailyRoot 'dist\assets\app-*.js') | Select-Object -First 1 -ExpandProperty Name)
$report.automaticBackup = $before.backupStatus

# Stop daily: local-service first (owned node), then supervisor if present
Push-Location $DailyRoot
try {
  $stopLocal = & powershell -NoProfile -File .\scripts\local-service.ps1 -Action stop 2>&1 | Out-String
  $report.stopLocal = $stopLocal.Trim()
  $stopSuper = & powershell -NoProfile -File .\scripts\supervise-service.ps1 -Action stop 2>&1 | Out-String
  $report.stopSupervisor = $stopSuper.Trim()
} finally { Pop-Location }

Start-Sleep -Seconds 3
$still = $false
try { $null = Invoke-RestMethod -Uri ($base + '/api/health') -TimeoutSec 2; $still = $true } catch { $still = $false }
if ($still) { throw 'Service still responding after stop' }
$report.stopped = $true

# Data layer backup after stop (sqlite files only; no .env / credentials)
$dataCopy = Join-Path $backupRoot 'data-copy'
New-Item -ItemType Directory -Force -Path $dataCopy | Out-Null
Copy-Item (Join-Path $DailyRoot 'data\*.sqlite*') $dataCopy -Force -ErrorAction SilentlyContinue
$report.dataCopy = $dataCopy
$report.dataCopyFiles = @(Get-ChildItem $dataCopy -File | Select-Object -ExpandProperty Name)

# Sync product sources (preserve .env, data, .runtime, node_modules)
$syncDirs = @('server','shared','src','scripts')
foreach ($d in $syncDirs) {
  $src = Join-Path $Worktree $d
  $dst = Join-Path $DailyRoot $d
  if (-not (Test-Path $src)) { continue }
  robocopy $src $dst /E /XD node_modules .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $d code=$LASTEXITCODE" }
}
Copy-Item (Join-Path $Worktree 'package.json') (Join-Path $DailyRoot 'package.json') -Force
if (Test-Path (Join-Path $Worktree 'package-lock.json')) {
  Copy-Item (Join-Path $Worktree 'package-lock.json') (Join-Path $DailyRoot 'package-lock.json') -Force
}
if (Test-Path (Join-Path $Worktree 'vite.config.ts')) {
  Copy-Item (Join-Path $Worktree 'vite.config.ts') (Join-Path $DailyRoot 'vite.config.ts') -Force
}
if (Test-Path (Join-Path $Worktree 'tsconfig.json')) {
  Copy-Item (Join-Path $Worktree 'tsconfig.json') (Join-Path $DailyRoot 'tsconfig.json') -Force
}
$report.syncedDirs = $syncDirs

# Replace dist with candidate build
$distLive = Join-Path $DailyRoot 'dist'
Remove-Item -LiteralPath $distLive -Recurse -Force
Copy-Item -LiteralPath $Candidate -Destination $distLive -Recurse -Force
$report.dailyAppJsAfter = (Get-ChildItem (Join-Path $distLive 'assets\app-*.js') | Select-Object -First 1 -ExpandProperty Name)
$report.distApplied = ($report.dailyAppJsAfter -eq $report.candidateAppJs)

# Start daily (supervisor wraps local-service)
Push-Location $DailyRoot
try {
  $startOut = & powershell -NoProfile -File .\scripts\supervise-service.ps1 -Action start 2>&1 | Out-String
  $report.start = $startOut.Trim()
  # If supervisor thinks deliberately-stopped, start local-service directly
  if ($startOut -match 'deliberately stopped|managed-start-unavailable|Service was deliberately') {
    $startLocal = & powershell -NoProfile -File .\scripts\local-service.ps1 -Action start 2>&1 | Out-String
    $report.startLocal = $startLocal.Trim()
  }
} finally { Pop-Location }

# Wait ready
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $h = Invoke-RestMethod -Uri ($base + '/api/health') -TimeoutSec 2
    if ($h.ready) { $ready = $true; $report.healthAfter = $h; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'Service did not become ready after apply' }

$session2 = New-AuthSession $base $password
$after = Snapshot-Business $base $session2
$report.after = $after
$report.after | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $Evidence "chat16-after-$stamp.json") -Encoding UTF8

# Compare digests
$digestOk = $true
$digestDiff = @()
foreach ($k in @($before.collections.Keys)) {
  $b = $before.collections[$k]
  $a = $after.collections[$k]
  if ($b.digest -ne $a.digest -or $b.count -ne $a.count) {
    $digestOk = $false
    $digestDiff += @{ kind = $k; before = $b; after = $a }
  }
}
$report.digestDiff = $digestDiff
$report.businessDigestUnchanged = $digestOk
$report.rollback = @{
  distBackup = $distBackup
  steps = @(
    'supervise-service.ps1 -Action stop',
    "Remove-Item dist -Recurse; Copy-Item '$distBackup' dist -Recurse",
    'supervise-service.ps1 -Action start'
  )
}

# Browser smoke: workbench HTML + chat-ui marker
$wb = Invoke-WebRequest -Uri ($base + '/workbench') -UseBasicParsing -TimeoutSec 10
$report.browserSmoke = @{
  workbenchStatus = [int]$wb.StatusCode
  referencesCandidateApp = ($wb.Content -match [regex]::Escape($report.dailyAppJsAfter))
}

$report.passed = [bool]($report.distApplied -and $digestOk -and $ready -and $report.browserSmoke.workbenchStatus -eq 200)
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $Evidence 'chat16-report.json') -Encoding UTF8
Write-Output (($report | Select-Object passed, distApplied, businessDigestUnchanged, candidateAppJs, dailyAppJsAfter, backupRoot) | ConvertTo-Json -Compress)
if (-not $report.passed) { exit 1 }

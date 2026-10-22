# Serial test runner via cmd to avoid PowerShell NativeCommandError on node stderr.
param(
  [string]$EvidenceDir = ''
)
$ErrorActionPreference = 'SilentlyContinue'
$root = if ($PSScriptRoot) { (Resolve-Path (Join-Path $PSScriptRoot '..')).Path } else { Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
Set-Location $root
if (-not $EvidenceDir) {
  if ($env:CHAT_UI_SERIAL_EVIDENCE) { $EvidenceDir = $env:CHAT_UI_SERIAL_EVIDENCE }
  elseif ($env:SERIAL_TEST_EVIDENCE) { $EvidenceDir = $env:SERIAL_TEST_EVIDENCE }
  else { $EvidenceDir = 'output/dev-evidence/pi-parity/loop-169' }
}
if (-not [System.IO.Path]::IsPathRooted($EvidenceDir)) { $EvidenceDir = Join-Path $root $EvidenceDir }
$outDir = $EvidenceDir
$log = Join-Path $outDir 'npm-test-serial.log'
$summary = Join-Path $outDir 'npm-test-serial-summary.json'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
@(
  'PI_PROVIDER','PI_MODEL','PI_API_KEY','DEEPSEEK_API_KEY','PI_MAX_CALLS','PI_BUDGET_USD',
  'PI_PRIOR_CALLS','PI_PRIOR_USD','PI_CALL_RESERVE_USD','PI_THINKING_LEVEL','PI_MAX_OUTPUT_TOKENS','PI_TIMEOUT_MS'
) | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }

# Node 24 defaults per-file suite timeout to 60s; pi-retry-worker alone needs ~70s under load.
$testTimeoutMs = 180000
$files = Get-ChildItem (Join-Path $root 'tests\*.test.ts') | Sort-Object Name
$results = @()
"serial-start $(Get-Date -Format o) files=$($files.Count) test-timeout=$testTimeoutMs" | Set-Content -Path $log -Encoding utf8
foreach ($f in $files) {
  $name = $f.Name
  $partial = Join-Path $outDir ("partial-" + $name + ".log")
  "--- BEGIN $name $(Get-Date -Format o) ---" | Add-Content -Path $log -Encoding utf8
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "node --import tsx --test --test-timeout=$testTimeoutMs `"$($f.FullName)`" > `"$partial`" 2>&1") -Wait -PassThru -NoNewWindow
  $code = $p.ExitCode
  if (Test-Path $partial) {
    Get-Content $partial -Raw -ErrorAction SilentlyContinue | Add-Content -Path $log -Encoding utf8
    $text = Get-Content $partial -Raw -ErrorAction SilentlyContinue
  } else { $text = '' }
  $pass = $null; $fail = $null
  if ($text -match '(?m)^# pass (\d+)') { $pass = [int]$Matches[1] }
  elseif ($text -match 'pass (\d+)') { $pass = [int]$Matches[1] }
  if ($text -match '(?m)^# fail (\d+)') { $fail = [int]$Matches[1] }
  elseif ($text -match 'fail (\d+)') { $fail = [int]$Matches[1] }
  $results += [pscustomobject]@{ file = $name; exit = $code; pass = $pass; fail = $fail }
  "--- END $name exit=$code pass=$pass fail=$fail ---" | Add-Content -Path $log -Encoding utf8
  Remove-Item -Force $partial -ErrorAction SilentlyContinue
}
$results | ConvertTo-Json | Set-Content -Path $summary -Encoding utf8
$failed = @($results | Where-Object { $_.exit -ne 0 -or ($null -ne $_.fail -and $_.fail -gt 0) })
"serial-done failed=$($failed.Count)/$($results.Count)" | Add-Content -Path $log -Encoding utf8
$failed | Format-Table | Out-String | Add-Content -Path $log -Encoding utf8
if ($failed.Count -gt 0) { exit 1 }
exit 0

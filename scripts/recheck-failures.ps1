$ErrorActionPreference = 'SilentlyContinue'
@(
  'PI_PROVIDER','PI_MODEL','PI_API_KEY','DEEPSEEK_API_KEY','PI_MAX_CALLS','PI_BUDGET_USD',
  'PI_PRIOR_CALLS','PI_PRIOR_USD','PI_CALL_RESERVE_USD','PI_THINKING_LEVEL','PI_MAX_OUTPUT_TOKENS','PI_TIMEOUT_MS'
) | ForEach-Object { Remove-Item "Env:$_" -ErrorAction SilentlyContinue }

$outDir = 'output/dev-evidence/pi-parity/loop-166'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$files = @(
  'draft-agent.test.ts','faults.test.ts','pi-idle-worker.test.ts','pi-mcp-worker.test.ts',
  'pi-native-output-worker.test.ts','pi-nested-mcp-force-stop.test.ts','pi-retry-worker.test.ts','research.test.ts'
)
$diag = @()
foreach ($f in $files) {
  $log = Join-Path $outDir $f.Replace('.ts','.log')
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "node --import tsx --test tests\$f > `"$log`" 2>&1") -Wait -PassThru -NoNewWindow
  $text = if (Test-Path $log) { Get-Content $log -Raw } else { '' }
  $pass = $null; $fail = $null
  if ($text -match '(?m)^# pass (\d+)') { $pass = [int]$Matches[1] }
  elseif ($text -match 'pass (\d+)') { $pass = [int]$Matches[1] }
  if ($text -match '(?m)^# fail (\d+)') { $fail = [int]$Matches[1] }
  elseif ($text -match 'fail (\d+)') { $fail = [int]$Matches[1] }
  $names = @([regex]::Matches($text, '(?m)^.? (.+?) \(') | ForEach-Object { $_.Groups[1].Value })
  # Prefer lines that look like failing test titles near AssertionError blocks
  $failedCases = @()
  foreach ($m in [regex]::Matches($text, '(?ms)test at[^\n]+\r?\n.? ([^\r\n]+?) \(([0-9.]+)ms\)\r?\n\s+(AssertionError|Error)[^\n]*\r?\n([^\n]+)')) {
    $failedCases += ($m.Groups[1].Value.Trim() + ' :: ' + $m.Groups[4].Value.Trim())
  }
  $diag += [pscustomobject]@{
    file = $f
    exit = $p.ExitCode
    pass = $pass
    fail = $fail
    failedCases = $failedCases
  }
  Write-Output ("{0} exit={1} pass={2} fail={3}" -f $f, $p.ExitCode, $pass, $fail)
}
$diag | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $outDir 'fresh-diag.json') -Encoding utf8
Write-Output 'DIAG_DONE'

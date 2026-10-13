param([ValidateSet('setup','start','build','test','probe','node')][string]$Action='start')
$ErrorActionPreference='Stop'
$taskRuntime=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$taskCandidate=(Get-Command node -ErrorAction SilentlyContinue).Source
if ($taskCandidate -and [int]((& $taskCandidate --version).TrimStart('v').Split('.')[0]) -ge 24) { $taskRuntime=$taskCandidate }
if (-not (Test-Path -LiteralPath $taskRuntime)) { throw '需要安装 Node.js 24+' }
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
switch ($Action) {
  'setup' { & $taskRuntime --import tsx scripts/setup.ts }
  'start' { & (Join-Path $PSScriptRoot 'supervise-service.ps1') -Action start }
  'build' { & $taskRuntime node_modules/typescript/bin/tsc --noEmit; if ($LASTEXITCODE -eq 0) { & $taskRuntime node_modules/vite/bin/vite.js build } }
  'test' { & $taskRuntime --import tsx --test tests/*.test.ts }
  'probe' { & $taskRuntime --import tsx scripts/probe-pi.ts }
  'node' { & $taskRuntime --import tsx scripts/local-node.ts }
}
exit $LASTEXITCODE

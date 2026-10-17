param(
    [ValidateSet('setup', 'packages', 'dev', 'local-dev', 'local-preview', 'baseline', 'probe', 'workspace', 'build', 'bundle-service', 'stage-desktop')]
    [string]$Action = 'dev',
    [string]$NodePath = 'node'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content -Raw -LiteralPath (Join-Path $workspaceRoot 'apps/canvas/upstream.json') | ConvertFrom-Json
$checkout = Join-Path $workspaceRoot $manifest.checkout
$toolchain = Join-Path $workspaceRoot '.runtime/canvas-toolchain'
$bunBin = Join-Path $toolchain 'node_modules/bun/bin/bun.exe'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    # Windows PowerShell wraps redirected native stderr in ErrorRecord objects.
    # Bun and Git write normal progress there: judge failure by the exit code.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Program @Arguments
        $nativeExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($nativeExitCode -ne 0) { throw "$Program failed with exit code $nativeExitCode" }
}

Push-Location $workspaceRoot
try {
    if ($Action -eq 'setup') {
        if (-not (Test-Path -LiteralPath $bunBin)) {
            Invoke-Checked 'npm.cmd' @('install', '--prefix', $toolchain, '--no-audit', '--no-fund', $manifest.packageManager)
        }
        if (-not (Test-Path -LiteralPath $checkout)) {
            Invoke-Checked 'git' @('init', $checkout)
            Invoke-Checked 'git' @('-C', $checkout, 'remote', 'add', 'origin', $manifest.repository)
            Invoke-Checked 'git' @('-C', $checkout, 'fetch', '--depth', '1', 'origin', $manifest.commit)
            Invoke-Checked 'git' @('-C', $checkout, 'checkout', '--detach', $manifest.commit)
        }
    }
    if (-not (Test-Path -LiteralPath $bunBin)) { throw 'Run scripts/canvas.ps1 setup first.' }
    $actualCommit = & git -C $checkout rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $actualCommit.Trim() -ne $manifest.commit) {
        throw 'OpenPencil checkout does not match upstream.json. Preserve local changes and inspect before continuing.'
    }
    $actualBun = & $bunBin --version
    if ($LASTEXITCODE -ne 0 -or "bun@$($actualBun.Trim())" -ne $manifest.packageManager) {
        throw 'Bun version does not match upstream.json.'
    }
    $env:PATH = (Split-Path $bunBin -Parent) + ';' + (Join-Path $toolchain 'node_modules/.bin') + ';' + $env:PATH
    # Use ports separate from the existing OS workbench. Playwright owns its test server.
    $env:OPENPENCIL_TEST_PORT = [string]$manifest.appPort
    $env:OPENPENCIL_TEST_MCP_PORT = [string]$manifest.mcpPort
    $env:OPENPENCIL_TEST_SERVER = 'app'
    $env:OPENPENCIL_TEST_REUSE_SERVER = '0'
    $env:OPENPENCIL_DEV_ORIGIN = "http://localhost:$($manifest.appPort)"
    $env:OPENPENCIL_DEV_MCP_PORT = [string]$manifest.mcpPort
    Set-Location $checkout
    switch ($Action) {
        'setup' {
            foreach ($patch in Get-ChildItem -LiteralPath (Join-Path $workspaceRoot 'apps/canvas/patches') -Filter '*.patch' | Sort-Object Name) {
                $previousPreference = $ErrorActionPreference
                try {
                    $ErrorActionPreference = 'Continue'
                    & git apply --reverse --check $patch.FullName 2>&1 | Out-Null
                    $alreadyApplied = $LASTEXITCODE -eq 0
                } finally { $ErrorActionPreference = $previousPreference }
                if (-not $alreadyApplied) {
                    Invoke-Checked 'git' @('apply', '--check', $patch.FullName)
                    Invoke-Checked 'git' @('apply', $patch.FullName)
                }
            }
            Invoke-Checked $bunBin @('install', '--frozen-lockfile')
        }
        'packages' { Invoke-Checked $bunBin @('run', 'build:packages') }
        'bundle-service' { Invoke-Checked $bunBin @((Join-Path $workspaceRoot 'apps/canvas/build-service.mjs')) }
        'stage-desktop' { Invoke-Checked $NodePath @((Join-Path $workspaceRoot 'apps/canvas/stage-desktop.mjs')) }
        'build' { Invoke-Checked $bunBin @('run', 'build') }
        'dev' { Invoke-Checked $bunBin @('run', 'dev', '--port', [string]$manifest.appPort, '--strictPort') }
        { $_ -in 'local-dev', 'local-preview' } {
            $nodeMajor = & $NodePath -p "process.versions.node.split('.')[0]"
            if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 24) { throw 'local-dev requires Node 24+. Supply -NodePath with a Node 24 executable.' }
            $localArguments = @((Join-Path $workspaceRoot 'apps/canvas/local/dev.mjs'))
            if ($Action -eq 'local-preview') { $localArguments += '--preview' }
            Invoke-Checked $NodePath $localArguments
        }
        'probe' { Invoke-Checked 'node' @((Join-Path $workspaceRoot 'apps/canvas/probes/baseline.mjs')) }
        'workspace' { Invoke-Checked 'node' @((Join-Path $workspaceRoot 'apps/canvas/probes/workspace.mjs')) }
        'baseline' {
            Invoke-Checked $bunBin @('x', '--no-install', 'playwright', 'test', '--project=openpencil', 'tests/e2e/editor/create-shapes.spec.ts', '--reporter=list')
        }
    }
} finally { Pop-Location }

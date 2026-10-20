param(
    [Parameter(Mandatory = $true)]
    [string]$ResourcesPath,
    [switch]$Installer,
    [switch]$Release
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
$resources = (Resolve-Path -LiteralPath $ResourcesPath).Path
$config = Join-Path $resources 'tauri.os.generated.json'
if (-not (Test-Path -LiteralPath $config)) { throw 'Run canvas.ps1 stage-desktop first.' }
$manifest = Get-Content -Raw -LiteralPath (Join-Path $resources 'resources.json') | ConvertFrom-Json
if ($manifest.kind -ne 'desktop-resource-staging' -or $manifest.node -ne 'v24.19.0') {
    throw 'Unsupported desktop resources'
}
foreach ($resource in $manifest.files) {
    $resourcePath = [IO.Path]::GetFullPath((Join-Path $resources $resource.path))
    if (-not $resourcePath.StartsWith($resources.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Resource path escapes staging directory'
    }
    if ((Get-FileHash -LiteralPath $resourcePath -Algorithm SHA256).Hash -ne $resource.sha256) {
        throw "Staged resource changed: $($resource.path)"
    }
}
$previousCargo = $env:CARGO_HOME
$previousRustup = $env:RUSTUP_HOME
$previousToolchain = $env:RUSTUP_TOOLCHAIN
$previousPath = $env:PATH
Push-Location (Join-Path $workspaceRoot '.runtime/open-pencil-upstream')
try {
    $env:CARGO_HOME = Join-Path $workspaceRoot '.runtime/canvas-rust/cargo'
    $env:RUSTUP_HOME = Join-Path $workspaceRoot '.runtime/canvas-rust/rustup'
    $env:RUSTUP_TOOLCHAIN = '1.99.0'
    $bun = Join-Path $workspaceRoot '.runtime/canvas-toolchain/node_modules/bun/bin/bun.exe'
    $env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + (Split-Path $bun -Parent) + ';' + $previousPath
    if ($Installer) {
        & $bun run tauri build --bundles nsis --config $config
    } elseif ($Release) {
        & $bun run tauri build --no-bundle --config $config
    } else {
        & $bun run tauri build --debug --no-bundle --config $config
    }
    if ($LASTEXITCODE -ne 0) { throw "Native build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
    $env:CARGO_HOME = $previousCargo
    $env:RUSTUP_HOME = $previousRustup
    $env:RUSTUP_TOOLCHAIN = $previousToolchain
    $env:PATH = $previousPath
}

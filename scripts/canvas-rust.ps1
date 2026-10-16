param(
    [ValidateSet('setup', 'version', 'check')]
    [string]$Action = 'version'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path $PSScriptRoot -Parent
$rustDirectory = Join-Path $workspaceRoot '.runtime/canvas-rust'
$rustVersion = '1.99.0'
$previousCargo = $env:CARGO_HOME
$previousRustup = $env:RUSTUP_HOME
$previousPath = $env:PATH

function Invoke-RustChecked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

try {
    $env:CARGO_HOME = Join-Path $rustDirectory 'cargo'
    $env:RUSTUP_HOME = Join-Path $rustDirectory 'rustup'
    $env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + $previousPath
    $rustup = Join-Path $env:CARGO_HOME 'bin/rustup.exe'
    if ($Action -eq 'setup') {
        New-Item -ItemType Directory -Force -Path $rustDirectory | Out-Null
        if (-not (Test-Path -LiteralPath $rustup)) {
            $installer = Join-Path $rustDirectory 'rustup-init.exe'
            $url = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
            Invoke-RustChecked 'curl.exe' @('--fail', '--location', '--retry', '2', '--output', $installer, $url)
            $checksumFile = Join-Path $rustDirectory 'rustup-init.exe.sha256'
            Invoke-RustChecked 'curl.exe' @('--fail', '--location', '--output', $checksumFile, "$url.sha256")
            $expected = ((Get-Content -Raw -LiteralPath $checksumFile).Trim() -split '\s+')[0]
            if ($expected -notmatch '^[0-9a-fA-F]{64}$' -or
                (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expected) {
                throw 'Rustup installer checksum mismatch'
            }
            Invoke-RustChecked $installer @('-y', '--no-modify-path', '--profile', 'minimal', '--default-host', 'x86_64-pc-windows-msvc', '--default-toolchain', 'none')
        }
        Invoke-RustChecked $rustup @('toolchain', 'install', $rustVersion, '--profile', 'minimal')
    }
    if (-not (Test-Path -LiteralPath $rustup)) { throw 'Run scripts/canvas-rust.ps1 setup first.' }
    Invoke-RustChecked $rustup @('run', $rustVersion, 'rustc', '--version')
    Invoke-RustChecked $rustup @('run', $rustVersion, 'cargo', '--version')
    if ($Action -eq 'check') {
        $desktop = Join-Path $workspaceRoot '.runtime/open-pencil-upstream/desktop'
        if (-not (Test-Path -LiteralPath (Join-Path $desktop 'icons/icon.ico'))) {
            throw 'Generate desktop icons with the pinned Bun before cargo check.'
        }
        Invoke-RustChecked $rustup @('run', $rustVersion, 'cargo', 'check', '--locked', '--manifest-path', (Join-Path $desktop 'Cargo.toml'))
    }
} finally {
    $env:CARGO_HOME = $previousCargo
    $env:RUSTUP_HOME = $previousRustup
    $env:PATH = $previousPath
}

param([string]$Path)
$ErrorActionPreference='Stop'
$taskLockStream=[System.IO.File]::Open($Path,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
try { [Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null }
finally { $taskLockStream.Dispose() }

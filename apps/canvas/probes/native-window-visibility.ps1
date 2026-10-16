param([Parameter(Mandatory=$true)][int]$TargetProcessId,[long]$RootHandle=0)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CanvasWindowVisibility {
 public delegate bool Visitor(IntPtr hwnd,IntPtr data);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd,Visitor callback,IntPtr data);
 public static long[] Children(IntPtr root){var values=new List<long>();EnumChildWindows(root,(h,d)=>{values.Add(h.ToInt64());return true;},IntPtr.Zero);return values.ToArray();}
}
'@
$process=Get-Process -Id $TargetProcessId -ErrorAction Stop
$handle=if($RootHandle -ne 0){[IntPtr]$RootHandle}else{$process.MainWindowHandle}
[uint32]$owner=0
[void][CanvasWindowVisibility]::GetWindowThreadProcessId($handle,[ref]$owner)
if($owner -ne $TargetProcessId){throw 'Window ownership mismatch'}
$children=@([CanvasWindowVisibility]::Children($handle) | ForEach-Object {
  [ordered]@{handle=$_;visible=[CanvasWindowVisibility]::IsWindowVisible([IntPtr]$_)}
})
[ordered]@{pid=$TargetProcessId;handle=$handle.ToInt64();visible=[CanvasWindowVisibility]::IsWindowVisible($handle);children=$children} | ConvertTo-Json -Depth 4

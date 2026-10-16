param([Parameter(Mandatory=$true)][int]$TargetProcessId, [switch]$SendProbe, [switch]$VirtualKey, [switch]$CommitIme, [switch]$DesktopShortcut, [long]$TargetWindowHandle=0)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CanvasInputProbe {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int l,t,r,b; }
 [StructLayout(LayoutKind.Sequential)] public struct GUI { public uint size,flags; public IntPtr active,focus,capture,menu,movesize,caret; public RECT rect; }
 [StructLayout(LayoutKind.Sequential)] public struct KEY { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit, Size=32)] public struct UNION { [FieldOffset(0)] public KEY key; }
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION data; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread,ref GUI info);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
 [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count,INPUT[] inputs,int size);
 public static GUI Inspect(IntPtr h) { uint pid; uint thread=GetWindowThreadProcessId(h,out pid); GUI g=new GUI();g.size=(uint)Marshal.SizeOf(typeof(GUI)); if(!GetGUIThreadInfo(thread,ref g))throw new Exception("GUI focus unavailable");return g; }
 public static uint Shortcut(){
  ushort[] keys={0x11,0x12,0x79,0x79,0x12,0x11}; INPUT[] values=new INPUT[6];
  for(int i=0;i<6;i++){values[i].type=1;values[i].data.key.vk=keys[i];values[i].data.key.flags=i<3?0u:2u;}
  return SendInput(6,values,Marshal.SizeOf(typeof(INPUT)));
 }
 public static uint Send(bool virtualKey, bool commitIme){ INPUT a=new INPUT(); a.type=1; a.data.key.scan=0x0058; a.data.key.flags=4; if(virtualKey){a.data.key.scan=0;a.data.key.vk=commitIme ? (ushort)0x20 : (ushort)0x59;a.data.key.flags=0;} INPUT b=a;b.data.key.flags=virtualKey ? 2u : 6u; return SendInput(2,new INPUT[]{a,b},Marshal.SizeOf(typeof(INPUT))); }
}
'@
$target=Get-Process -Id $TargetProcessId
$foreground=[CanvasInputProbe]::GetForegroundWindow()
$expected=if($TargetWindowHandle -ne 0){[IntPtr]$TargetWindowHandle}else{$target.MainWindowHandle}
[uint32]$owner=0
[void][CanvasInputProbe]::GetWindowThreadProcessId($expected,[ref]$owner)
if($owner -ne $TargetProcessId){throw 'Target window does not belong to expected process'}
if($foreground -ne $expected){throw 'Target is not foreground; refusing to send input'}
$info=[CanvasInputProbe]::Inspect($foreground)
if([CanvasInputProbe]::GetAncestor($info.focus,2) -ne $foreground){throw 'Focused receiver is outside target window'}
$result=[ordered]@{pid=$TargetProcessId;foreground=$foreground.ToInt64();focus=$info.focus.ToInt64();active=$info.active.ToInt64();sent=0}
if($DesktopShortcut){$result.sent=[CanvasInputProbe]::Shortcut();if($result.sent -ne 6){throw 'Shortcut input incomplete'}}
elseif($SendProbe){$result.sent=[CanvasInputProbe]::Send(($VirtualKey.IsPresent -or $CommitIme.IsPresent), $CommitIme.IsPresent);if($result.sent -ne 2){throw 'SendInput did not deliver both events'}}
$result | ConvertTo-Json

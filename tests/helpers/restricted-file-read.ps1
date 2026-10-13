param([Parameter(Mandatory=$true)][string]$Path,[ValidateSet('World','AuthenticatedUsers')][string]$RestrictedGroup='World')
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Security.Principal;using System.IO;
public static class WorkbenchRestrictedRead {
 [StructLayout(LayoutKind.Sequential)]struct SidAndAttributes {public IntPtr sid;public uint attributes;}
 [DllImport("kernel32.dll")]static extern IntPtr GetCurrentProcess();
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool CreateRestrictedToken(IntPtr token,uint flags,uint disabled,IntPtr disabledSids,uint deleted,IntPtr privileges,uint restricted,ref SidAndAttributes restrictedSid,out IntPtr result);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool ImpersonateLoggedOnUser(IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)]static extern bool RevertToSelf();
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
 public static bool Read(string path,bool authenticatedUsers){IntPtr token=IntPtr.Zero,restricted=IntPtr.Zero,sid=IntPtr.Zero;bool impersonated=false;try{
  if(!OpenProcessToken(GetCurrentProcess(),10,out token))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  var world=new SecurityIdentifier(authenticatedUsers?WellKnownSidType.AuthenticatedUserSid:WellKnownSidType.WorldSid,null);var bytes=new byte[world.BinaryLength];world.GetBinaryForm(bytes,0);sid=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,sid,bytes.Length);var rule=new SidAndAttributes{sid=sid,attributes=0};
  if(!CreateRestrictedToken(token,1,0,IntPtr.Zero,0,IntPtr.Zero,1,ref rule,out restricted))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  if(!ImpersonateLoggedOnUser(restricted))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());impersonated=true;
  try{using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){file.ReadByte();return true;}}catch(UnauthorizedAccessException){return false;}
 }finally{if(impersonated&&!RevertToSelf())throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(token!=IntPtr.Zero)CloseHandle(token);if(sid!=IntPtr.Zero)Marshal.FreeHGlobal(sid);}}
}
'@
$taskAllowed=[WorkbenchRestrictedRead]::Read([IO.Path]::GetFullPath($Path),($RestrictedGroup -eq 'AuthenticatedUsers'))
@{readAllowed=$taskAllowed;identity=('current-user token restricted by '+$RestrictedGroup+' SID');contentsPrinted=$false} | ConvertTo-Json -Compress

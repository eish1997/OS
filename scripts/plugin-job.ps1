param([Parameter(Mandatory=$true)][int]$WorkerId)
$ErrorActionPreference = 'Stop'
# The guardian starts before the worker is assigned, so it stays outside this
# job. A worker exit or guardian exit closes the job and kills remaining children.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PluginJob {
  [StructLayout(LayoutKind.Sequential)] public struct Basic {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Io {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }
  [StructLayout(LayoutKind.Sequential)] public struct Extended {
    public Basic BasicLimitInformation;
    public Io IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref Extended info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@
$worker = [Diagnostics.Process]::GetProcessById($WorkerId)
$job = [PluginJob]::CreateJobObject([IntPtr]::Zero, $null)
if ($job -eq [IntPtr]::Zero) { throw 'Cannot create plugin process job' }
try {
  $limits = New-Object PluginJob+Extended
  $limits.BasicLimitInformation.LimitFlags = 0x2000 # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
  $size = [Runtime.InteropServices.Marshal]::SizeOf($limits)
  if (-not [PluginJob]::SetInformationJobObject($job, 9, [ref]$limits, $size)) { throw 'Cannot configure plugin process job' }
  if (-not [PluginJob]::AssignProcessToJobObject($job, $worker.Handle)) { throw 'Cannot assign plugin worker to process job' }
  [Console]::Out.WriteLine('ready')
  [Console]::Out.Flush()
  $worker.WaitForExit()
} finally {
  [void][PluginJob]::CloseHandle($job)
  $worker.Dispose()
}

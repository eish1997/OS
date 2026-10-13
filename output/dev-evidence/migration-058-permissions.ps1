$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public class MigrationAclEntry { public string Path; public string Sddl; public bool Directory; }
public static class MigrationAcl {
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint a;public System.Runtime.InteropServices.ComTypes.FILETIME c,x,w;public uint v,h,l,links,ih,il;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string name,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file,out Info info);
 static SecurityIdentifier Sid=WindowsIdentity.GetCurrent().User;
 static FileSystemSecurity Read(string p,bool d) {return d?(FileSystemSecurity)new DirectoryInfo(p).GetAccessControl():new FileInfo(p).GetAccessControl();}
 static void Write(string p,bool d,FileSystemSecurity acl) {if(d)new DirectoryInfo(p).SetAccessControl((DirectorySecurity)acl);else new FileInfo(p).SetAccessControl((FileSecurity)acl);}
 static void Check(string p,bool d,FileSystemSecurity acl) {
  if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("Linked entry refused: "+p);
  if(acl.GetOwner(typeof(SecurityIdentifier)).Value!=Sid.Value)throw new Exception("Different owner: "+p);
  if(!d)using(var h=CreateFile(p,0,7,IntPtr.Zero,3,0,IntPtr.Zero)){Info i;if(h.IsInvalid||!GetFileInformationByHandle(h,out i))throw new Exception("Cannot inspect links: "+p);if(i.links>1)throw new Exception("Hardlink refused: "+p);}
 }
 static bool Private(FileSystemSecurity acl) {var rules=acl.GetAccessRules(true,true,typeof(SecurityIdentifier));if(!acl.AreAccessRulesProtected||rules.Count!=1)return false;var r=(FileSystemAccessRule)rules[0];return r.IdentityReference.Value==Sid.Value&&r.AccessControlType==AccessControlType.Allow&&(r.FileSystemRights&FileSystemRights.FullControl)==FileSystemRights.FullControl;}
 public static MigrationAclEntry[] Scan(string root) {
  root=System.IO.Path.GetFullPath(root);if(root!=@"F:\AI\OS")throw new Exception("Unexpected migration root");
  for(var p=root;p!=null;p=System.IO.Path.GetDirectoryName(p))if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("Linked ancestor");
  var pending=new Stack<string>();var entries=new List<MigrationAclEntry>();pending.Push(root);
  while(pending.Count>0){var p=pending.Pop();bool d=(File.GetAttributes(p)&FileAttributes.Directory)!=0;var acl=Read(p,d);Check(p,d,acl);if(Private(acl))continue;entries.Add(new MigrationAclEntry{Path=p,Directory=d,Sddl=acl.GetSecurityDescriptorSddlForm(AccessControlSections.Access)});if(entries.Count>200000)throw new Exception("Migration exceeds inspected size limit");if(d)foreach(var c in Directory.GetFileSystemEntries(p))pending.Push(c);}
  return entries.OrderByDescending(e=>e.Path.Length).ToArray();
 }
 public static int Apply(MigrationAclEntry[] entries) {
  try {foreach(var e in entries){var acl=Read(e.Path,e.Directory);Check(e.Path,e.Directory,acl);acl.SetAccessRuleProtection(true,false);foreach(FileSystemAccessRule r in acl.GetAccessRules(true,false,typeof(SecurityIdentifier)))acl.RemoveAccessRuleSpecific(r);acl.AddAccessRule(e.Directory?new FileSystemAccessRule(Sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow):new FileSystemAccessRule(Sid,FileSystemRights.FullControl,AccessControlType.Allow));Write(e.Path,e.Directory,acl);if(!Private(Read(e.Path,e.Directory)))throw new Exception("ACL verification failed");}return entries.Length;}
  catch{foreach(var e in entries){if(!File.Exists(e.Path)&&!Directory.Exists(e.Path))continue;var acl=Read(e.Path,e.Directory);Check(e.Path,e.Directory,acl);acl.SetSecurityDescriptorSddlForm(e.Sddl,AccessControlSections.Access);Write(e.Path,e.Directory,acl);}throw;}
 }
}
'@
$taskEntries=[MigrationAcl]::Scan('F:\AI\OS')
$taskSnapshot='F:\AI\OS\.runtime\permission-snapshots\migration-058-batch.json'
if(Test-Path -LiteralPath $taskSnapshot){throw 'Snapshot exists'}
@{version=1;workspace='F:\AI\OS';ownerSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;at=[DateTime]::UtcNow.ToString('o');entries=$taskEntries} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskSnapshot -Encoding UTF8
$taskChanged=[MigrationAcl]::Apply($taskEntries)
@{state='protected';changed=$taskChanged;snapshot=$taskSnapshot} | ConvertTo-Json -Compress

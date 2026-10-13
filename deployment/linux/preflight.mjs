import {lstatSync,existsSync,accessSync,constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';

// Read-only startup guard. This does not install users, change permissions,
// initialize data, read credential files or contact model providers.
function reject(code){throw new Error(code);}
function noLinks(path){for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())reject('LINKED_PATH');if(dirname(p)===p)break;}}
function directory(path,uid,privateMode){noLinks(path);const s=lstatSync(path);if(!s.isDirectory()||s.uid!==uid)reject('DIRECTORY_OWNER');if(privateMode?(s.mode&0o777)!==0o700:(s.mode&0o022)!==0)reject('DIRECTORY_MODE');return s;}
try{
 if(process.platform!=='linux'||process.arch!=='x64')reject('LINUX_X64_REQUIRED');
 if(process.version!=='v24.19.0')reject('PINNED_NODE_REQUIRED');
 const uid=process.getuid();if(uid===0)reject('NON_ROOT_REQUIRED');
 const app='/opt/workbench/app';if(resolve('.')!==app)reject('APP_LOCATION');
 directory(app,0,false);directory('/opt/workbench/runtime',0,false);
 try{accessSync(app,constants.W_OK);reject('APP_WRITABLE');}catch(e){if(e.message==='APP_WRITABLE')throw e;if(e.code!=='EACCES'&&e.code!=='EROFS')throw e;}
 if(existsSync(join(app,'.env')))reject('APP_ENV_FORBIDDEN');
 if(process.env.PORT!=='4310'||process.env.DATA_DIR!=='/var/lib/workbench/data'||process.env.BACKUP_DIR!=='/srv/workbench-backup-volume/workbench')reject('SERVICE_PATHS');
 if(!process.env.WORKBENCH_PASSWORD||process.env.WORKBENCH_PASSWORD.length<24)reject('PASSWORD_REQUIRED');
 const origin=new URL(process.env.PUBLIC_ORIGIN||'');
 if(origin.protocol!=='https:'||origin.origin!==process.env.PUBLIC_ORIGIN||origin.hostname.endsWith('.invalid')||origin.hostname==='localhost')reject('PUBLIC_ORIGIN_REQUIRED');
 const dataParent=directory('/var/lib/workbench',uid,true);
 const backupParent=directory('/srv/workbench-backup-volume',uid,true);
 if(dataParent.dev===backupParent.dev)reject('INDEPENDENT_BACKUP_FILESYSTEM_REQUIRED');
 for(const path of [process.env.DATA_DIR,process.env.BACKUP_DIR])if(existsSync(path))directory(path,uid,true);
 console.log(JSON.stringify({status:'passed',node:process.version,readOnlyApp:true,independentBackupFilesystem:true}));
}catch(e){console.error(JSON.stringify({status:'refused',reason:e.message}));process.exitCode=1;}

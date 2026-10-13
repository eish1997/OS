import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,existsSync,cpSync,lstatSync} from 'node:fs';
import {resolve,join,dirname,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// An npm target-platform install is not execution of a Linux runtime. Keep
// foreign binaries inert and never copy user data, credentials or .npmrc.
const root=process.cwd(),out=resolve('output/dev-evidence');
if(process.platform!=='win32')throw new Error('This probe measures target selection on a Windows host; use real Linux deployment acceptance separately');
const sha=b=>createHash('sha256').update(b).digest('hex');
const evidence=join(out,'linux-install.json');
const npmVersion='11.21.0';
const npmIntegrity='sha512-Zov8KhamNneiLdELtj5YALtNmJW4L4fCLTzjfpzXG2w6MSHcf0UxgdlK5uloCuksWT+7mGUU7wi79cO6RqivPg==';
const read=f=>JSON.parse(readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const baseline=process.argv.includes('--baseline');
const resumeBaseline=process.argv.includes('--resume-baseline');
const windows=process.argv.includes('--windows');
mkdirSync(join(out,'private'),{recursive:true});
let report;
if(baseline){
 const bootstrap=process.env.WORKBENCH_PROBE_NPM_CLI;
 if(!bootstrap||!existsSync(bootstrap))throw new Error('Provide installed bootstrap npm CLI path as WORKBENCH_PROBE_NPM_CLI');
 const fixture=mkdtempSync(join(out,'private','linux-install-'));
 mkdirSync(join(fixture,'tools'));mkdirSync(join(fixture,'app'));
 writeFileSync(join(fixture,'user.npmrc'),'');writeFileSync(join(fixture,'global.npmrc'),'');
 writeFileSync(join(fixture,'tools/package.json'),JSON.stringify({private:true,dependencies:{npm:npmVersion}}));
 report={at:new Date().toISOString(),status:'preparing',host:process.platform,target:{os:'linux',cpu:'x64',libc:'glibc'},npmVersion,npmIntegrity,fixture,bootstrap,modelRequests:0,linuxExecuted:false,checks:[]};
 writeFileSync(evidence,JSON.stringify(report,null,2));
}else{report=read(evidence);assert.equal(report.status,resumeBaseline?'failed':windows?'passed':'baseline-incompatible');assert.equal(report.host,process.platform);assert.equal(report.npmVersion,npmVersion);assert.equal(report.npmIntegrity,npmIntegrity);assert(resolve(report.fixture).startsWith(join(out,'private')+sep));}
const fixture=report.fixture;
const env=Object.fromEntries(['SystemRoot','USERPROFILE','TEMP','TMP','PATH','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const configArgs=['--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org','--cache='+join(fixture,'cache'),'--userconfig='+join(fixture,'user.npmrc'),'--globalconfig='+join(fixture,'global.npmrc'),'--fetch-retries=1','--fetch-timeout=30000'];
const save=()=>writeFileSync(evidence,JSON.stringify(report,null,2));
async function run(name,cli,args,cwd,npmConfig=true){
 const child=spawn(process.execPath,[cli,...args,...(npmConfig?configArgs:[])],{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b.toString();if(output.length>4*1024*1024){child.kill();}});
 const timeout=setTimeout(()=>child.kill(),180000);let error;
 child.on('error',e=>{error=e.message;});
 const code=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timeout);
 const file=join(fixture,name+'.log');writeFileSync(file,output);
 report.checks.push({name,exitCode:code,error,outputSha256:sha(Buffer.from(output))});save();
 console.log(JSON.stringify({name,exitCode:code,error}));return {code,output};
}
try{
 if(baseline){
  const bootstrap=await run('npm-bootstrap',report.bootstrap,['install'],join(fixture,'tools'));assert.equal(bootstrap.code,0);
  assert.equal(read(join(fixture,'tools/package-lock.json')).packages['node_modules/npm'].integrity,npmIntegrity);
 }
 const cli=join(fixture,'tools/node_modules/npm/bin/npm-cli.js');assert(existsSync(cli));
 assert.equal(read(join(dirname(cli),'../package.json')).version,npmVersion);
 if(windows){
  const win=join(fixture,'app-windows');mkdirSync(win);
  for(const file of ['package.json','package-lock.json','src','shared','index.html','vite.config.ts'])cpSync(join(root,file),join(win,file),{recursive:true,dereference:false,filter:source=>{assert(!lstatSync(source).isSymbolicLink());return true;}});
  const installed=await run('windows-clean-install',cli,['ci','--os=win32','--cpu=x64'],win);assert.equal(installed.code,0,installed.output.slice(-2500));
  const binding=join(win,'node_modules/@rolldown/binding-win32-x64-msvc/package.json');assert.equal(read(binding).version,read(join(win,'package-lock.json')).packages['node_modules/@rolldown/binding-win32-x64-msvc'].version);
  const build=await run('windows-clean-build',join(win,'node_modules/vite/bin/vite.js'),['build'],win,false);assert.equal(build.code,0,build.output.slice(-2500));assert(existsSync(join(win,'dist/index.html')));
  for(const [file,hash] of Object.entries(report.afterHashes))assert.equal(sha(readFileSync(join(root,file))),hash);
  report.windowsCleanBuildPassed=true;report.completedAt=new Date().toISOString();save();console.log(JSON.stringify({status:report.status,windowsCleanBuildPassed:true,linuxExecuted:false,modelRequests:0}));process.exit(0);
 }
 if(!resumeBaseline)for(const f of ['package.json','package-lock.json'])copyFileSync(join(root,f),join(fixture,'app',f));
 const hashes=Object.fromEntries(['package.json','package-lock.json'].map(f=>[f,sha(readFileSync(join(root,f)))]));
 const args=['ci','--os=linux','--cpu=x64','--libc=glibc'];
 const result=resumeBaseline?{code:report.checks.at(-1).exitCode,output:''}:await run(baseline?'old-linux-resolution':'linux-install',cli,args,join(fixture,'app'));
 if(baseline||resumeBaseline){
  // npm's --os filters optional dependencies; its required-package check
  // still uses the real host OS. A Windows-host install can succeed while
  // retaining the incompatible required Windows binding. Do not claim that
  // this is a Linux execution or that a dry run proves Linux compatibility.
  assert.equal(result.code,0);const binding=read(join(fixture,'app/node_modules/@rolldown/binding-win32-x64-msvc/package.json'));
  const lock=read(join(fixture,'app/package-lock.json'));assert.equal(lock.packages['node_modules/@rolldown/binding-win32-x64-msvc'].optional,undefined);
  const require=createRequire(import.meta.url);const {checkPlatform}=require(join(fixture,'tools/node_modules/npm/node_modules/npm-install-checks/lib/index.js'));
  assert.throws(()=>checkPlatform(binding,false,{os:'linux',cpu:'x64',libc:'glibc'}),{code:'EBADPLATFORM'});
  report.beforeHashes=hashes;report.oldHostInstallExitCode=0;report.oldWindowsBindingPresent=true;report.oldRequiredBindingLinuxCheck='EBADPLATFORM';report.status='baseline-incompatible';delete report.error;
 }
 else{
  assert.equal(result.code,0,result.output.slice(-2500));
  const lock=read(join(fixture,'app/package-lock.json'));
  assert(!existsSync(join(fixture,'app/node_modules/@rolldown/binding-win32-x64-msvc')));
  const binding=join(fixture,'app/node_modules/@rolldown/binding-linux-x64-gnu');
  assert.equal(read(join(binding,'package.json')).version,lock.packages['node_modules/@rolldown/binding-linux-x64-gnu'].version);
  const binary=join(binding,'rolldown-binding.linux-x64-gnu.node');
  assert.equal(readFileSync(binary).subarray(0,4).toString('hex'),'7f454c46');
  for(const [f,hash] of Object.entries(hashes)){assert.equal(sha(readFileSync(join(root,f))),hash);assert.equal(sha(readFileSync(join(fixture,'app',f))),hash);}
  report.afterHashes=hashes;report.installedLinuxBindingSha256=sha(readFileSync(binary));report.windowsBindingAbsent=true;report.lockPreserved=true;report.status='passed';
 }
 save();console.log(JSON.stringify({status:report.status,npmVersion,linuxExecuted:false,modelRequests:0}));
}catch(e){report.status='failed';report.error=String(e.message);save();throw e;}

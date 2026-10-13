import {createServer, request as requestHttp} from 'node:http';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {extname, join, resolve, sep} from 'node:path';

// Dedicated loopback-only fault fixture. No browser automation or model calls.
// The caller must blank model configuration and provide an isolated DATA_DIR.
if(!process.env.WB_RECOVERY_INFO || !process.env.DATA_DIR || process.env.PI_API_KEY!=='' || process.env.PI_MAX_CALLS!=='0')throw new Error('Explicit isolated recovery fixture environment required');
const {createApp}=await import('../server/app.js');
const {config}=await import('../server/config.js');
const app=createApp({password:'synthetic-recovery-test-password',schedule:false});
await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));
const backendPort=(app.server.address() as {port:number}).port;
const controlToken=randomUUID();let paused=true;let dropRequests=false;let writes=0;let reads=0;let proxyRequests=0;let closing=false;
const fixturePort=Number(process.env.WB_RECOVERY_PORT||0);
if(!Number.isSafeInteger(fixturePort)||fixturePort<0||fixturePort>65535||fixturePort===4310)throw new Error('Invalid isolated recovery proxy port');
const dist=resolve('dist');const streams=new Set<import('node:http').ClientRequest>();const responses=new Set<import('node:http').ServerResponse>();
const proxy=createServer(async(req,res)=>{
  const path=new URL(req.url||'/','http://localhost').pathname;
  if(path.startsWith('/__fixture/')) {
    const token=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+controlToken);
    if(token.length!==expected.length||!timingSafeEqual(token,expected)){res.writeHead(401);res.end();return;}
    if(path==='/__fixture/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({paused,dropRequests,reads,writes,proxyRequests,backendPid:process.pid}));return;}
    if(req.method!=='POST'){res.writeHead(405);res.end();return;}
    if(path==='/__fixture/pause'){paused=true;dropRequests=false;for(const pending of streams)pending.destroy();for(const response of responses)response.destroy();}
    else if(path==='/__fixture/drop'){paused=true;dropRequests=true;for(const pending of streams)pending.destroy();for(const response of responses)response.destroy();}
    else if(path==='/__fixture/resume'){paused=false;dropRequests=false;}
    else if(path==='/__fixture/stop'){closing=true;res.end('stopping');setTimeout(()=>void stop(),50);return;}
    else{res.writeHead(404);res.end();return;}
    res.end('ok');return;
  }
  if(path.startsWith('/api/')) {
    responses.add(res);res.once('close',()=>responses.delete(res));
    if(req.method==='GET')reads++;else writes++;proxyRequests++;
    if(paused){if(dropRequests){req.socket.destroy();return;}res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'工作台正在重新启动，请稍后自动重连'}));return;}
    const upstream=requestHttp({host:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode!,response.headers);response.pipe(res);});
    streams.add(upstream);upstream.once('close',()=>streams.delete(upstream));upstream.once('error',()=>{if(!res.headersSent)res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'工作台暂时不可用'}));});res.once('close',()=>upstream.destroy());req.pipe(upstream);return;
  }
  const file=path==='/'?join(dist,'index.html'):resolve(dist,'.'+decodeURIComponent(path));
  if(!file.startsWith(dist+sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
  const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(readFileSync(file));
});
await new Promise<void>((done,reject)=>{proxy.once('error',reject);proxy.listen(fixturePort,'127.0.0.1',done);});
// Cookies are scoped by hostname, not port. Main product uses 127.0.0.1;
// the browser fixture must use localhost so a test login cannot replace it.
const port=(proxy.address() as {port:number}).port;config.origin='http://localhost:'+port;
const infoFile=resolve(process.env.WB_RECOVERY_INFO);mkdirSync(resolve(infoFile,'..'),{recursive:true});writeFileSync(infoFile,JSON.stringify({base:config.origin,controlToken,password:'synthetic-recovery-test-password',pid:process.pid,port,backendPort,modelRequests:0}));
console.log(JSON.stringify({base:config.origin,pid:process.pid,modelRequests:0,paused:true}));
async function stop(){if(!closing)closing=true;for(const request of streams)request.destroy();proxy.closeAllConnections();await new Promise<void>((done,reject)=>proxy.close(error=>error?reject(error):done()));await app.close();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());

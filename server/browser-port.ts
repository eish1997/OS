import type { Server } from 'node:http';
import { AppError } from './store.js';
// Pinned Undici Fetch implementation: lib/web/fetch/constants.js badPorts.
// A successful TCP listen is insufficient for a browser OAuth redirect.
const blocked=new Set('1 7 9 11 13 15 17 19 20 21 22 23 25 37 42 43 53 69 77 79 87 95 101 102 103 104 109 110 111 113 115 117 119 123 135 137 139 143 161 179 389 427 465 512 513 514 515 526 530 531 532 540 548 554 556 563 587 601 636 989 990 993 995 1719 1720 1723 2049 3659 4045 4190 5060 5061 6000 6566 6665 6666 6667 6668 6669 6679 6697 10080'.split(' ').map(Number));
export async function listenBrowserLoopback(server:Server,preferred=0) {
  if(!Number.isSafeInteger(preferred)||preferred<0||preferred>65535||blocked.has(preferred))throw new AppError(400,'授权回调端口不能供浏览器访问');
  for(let attempt=0;attempt<8;attempt++){
    await new Promise<void>((ok,no)=>{server.once('error',no);server.listen(preferred,'127.0.0.1',()=>{server.removeListener('error',no);ok();});});
    const port=(server.address() as {port:number}).port;
    if(!blocked.has(port))return;
    await new Promise<void>((ok,no)=>server.close(error=>error?no(error):ok()));
  }
  throw new AppError(503,'暂时无法分配可供浏览器访问的授权端口');
}

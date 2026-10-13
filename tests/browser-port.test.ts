import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { listenBrowserLoopback } from '../server/browser-port.js';
class Allocation extends EventEmitter {listens=0;closes=0;constructor(private ports:number[]){super();}listen(port:number,host:string,done:()=>void){assert.equal(port,0);assert.equal(host,'127.0.0.1');this.listens++;done();}address(){return {port:this.ports[Math.min(this.listens-1,this.ports.length-1)]};}close(done?:(error?:Error)=>void){this.closes++;done?.();}}
test('OAuth listener skips browser-blocked allocations, rejects fixed blocked ports and bounds retries',async()=>{const recovered=new Allocation([6667,51000]);await listenBrowserLoopback(recovered as unknown as Server);assert.equal(recovered.listens,2);assert.equal(recovered.closes,1);const bad=new Allocation([6667]);await assert.rejects(listenBrowserLoopback(bad as unknown as Server,6667),/浏览器/);assert.equal(bad.listens,0);await assert.rejects(listenBrowserLoopback(bad as unknown as Server),/分配/);assert.equal(bad.listens,8);assert.equal(bad.closes,8);});

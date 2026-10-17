import type { StorageLimits } from './storage.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CanvasTransport } from './canvas-transport.js';

export type CanvasServiceState = 'stopped' | 'starting' | 'ready' | 'failed' | 'stopping';

/** A private-pipe child, with no token in argv, environment, logs or browser state. */
export class CanvasService {
  #child?: ChildProcessWithoutNullStreams;
  #transport?: CanvasTransport;
  #pending?: Promise<CanvasTransport>;
  #exit?: Promise<void>;
  #restart?: Promise<CanvasTransport>;
  #disposed=false;
  #state: CanvasServiceState = 'stopped';
  constructor(readonly options: { entry: string; directory: string; origin: string; nodePath?: string; startupMs?: number; storage?: {dataDir:string; limits:StorageLimits} }) {}
  get state() { return this.#state; }
  get processId() { return this.#child?.pid; }
  get transport() { return this.#state === 'ready' ? this.#transport : undefined; }
  start(): Promise<CanvasTransport> {
    if(this.#disposed)return Promise.reject(new Error('Canvas service is disposed'));
    if (this.#state === 'ready') return Promise.resolve(this.#transport!);
    if (this.#pending) return this.#pending;
    if (this.#child || this.#state === 'stopping') return Promise.reject(new Error('Canvas service is stopping'));
    this.#state = 'starting';
    const token = randomBytes(32).toString('hex');
    const child = spawn(this.options.nodePath ?? process.execPath, [resolve(this.options.entry)], {
      stdio: 'pipe', windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP },
    });
    this.#child = child;
    this.#exit = new Promise<void>(done => {
      child.once('close', () => {
        if (this.#child === child) {
          this.#child = undefined; this.#transport = undefined;
          this.#state = this.#state === 'stopping' ? 'stopped' : 'failed';
        }
        done();
      });
    });
    child.stderr.resume(); // Do not retain arbitrary runtime output or private configuration.
    child.stdin.on('error', () => {}); // Exit/timeout below provides the bounded public error.
    this.#pending = new Promise<CanvasTransport>((accept, reject) => {
      let text = '', settled = false;
      const timer = setTimeout(() => fail(), this.options.startupMs ?? 15000);
      const fail = () => {
        if (settled) return; settled = true; clearTimeout(timer);
        this.#state = 'failed'; child.kill(); reject(new Error('Canvas service did not become ready'));
      };
      child.once('error', fail); child.once('close', fail);
      child.stdout.on('data', bytes => {
        if (settled) return;
        text += bytes.toString('utf8');
        if (text.length > 8192) { fail(); return; }
        if (!text.includes('\n')) return;
        try {
          const ready = JSON.parse(text.slice(0, text.indexOf('\n')));
          if (ready.type !== 'ready' || ready.protocolVersion !== 1 || typeof ready.url !== 'string') throw new Error();
          const transport = new CanvasTransport(ready.url, token, this.options.origin);
          if (this.#state !== 'starting') throw new Error();
          this.#transport = transport; this.#state = 'ready'; settled = true; clearTimeout(timer); accept(transport);
        } catch { fail(); }
      });
      child.stdin.write(JSON.stringify({ directory: resolve(this.options.directory), origin: this.options.origin, token, storage: this.options.storage }) + '\n');
    }).finally(() => { this.#pending = undefined; });
    return this.#pending;
  }
  async stop() {
    const child = this.#child;
    if (!child) { this.#state = 'stopped'; return; }
    this.#state = 'stopping'; this.#transport = undefined;
    child.stdin.end();
    const kill = setTimeout(() => child.kill(), 5000);
    try { await this.#exit; } finally { clearTimeout(kill); this.#state = 'stopped'; }
  }
  /** Explicit retry only; never repeatedly reload an editor with dirty content. */
  restart(): Promise<CanvasTransport> {
    if(this.#disposed)return Promise.reject(new Error('Canvas service is disposed'));
    if (this.#restart) return this.#restart;
    this.#restart=(async()=>{
      for(let attempt=0;attempt<2;attempt++) {
        await this.stop();
        if(attempt)await delay(100);
        try {return await this.start();} catch {await this.stop();}
      }
      this.#state='failed';throw new Error('Canvas service retry limit reached');
    })().finally(()=>{this.#restart=undefined;});
    return this.#restart;
  }
  async dispose() {
    this.#disposed=true;
    await this.stop();
    await this.#restart?.catch(()=>{});
    await this.stop();
  }
}

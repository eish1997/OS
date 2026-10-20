import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { Transform } from 'node:stream';
import { AppError } from './store.js';

const id = '[a-zA-Z0-9_-]{1,128}';
const routes = [
  ['GET', /^\/(health|layout|canvases|mounts)$/],
  ['GET', new RegExp(`^/operations/${id}$`)],
  ['GET', new RegExp(`^/canvases/${id}(?:/(scene|revisions|outputs))?$`)],
  ['POST', new RegExp(`^/(?:layout|canvases/${id})$`)],
  ['POST', new RegExp(`^/canvases/${id}/package$`)],
  ['GET', /^\/package-imports$/],
  ['POST', new RegExp(`^/package-imports/${id}(?:/resume)?$`)],
  ['GET', new RegExp(`^/mounts/${id}(?:/files)?$`)],
  ['POST', /^\/mounts$/],
  ['POST', new RegExp(`^/mounts/${id}/(?:scan|poll|relink-preview|relink-confirm)$`)],
  ['POST', new RegExp(`^/mounts/${id}/files/${id}/(?:open|open-preview|replacement-preview|replacement-confirm)$`)],
  ['GET', new RegExp(`^/outputs/${id}$`)],
  ['POST', /^\/outputs$/],
  ['POST', new RegExp(`^/outputs/${id}/(?:commit|cancel|replace)$`)],
  ['POST', /^\/file-targets\/(?:preview|confirm)$/],
] as const;

/** EMB-01 transport for an explicitly injected isolated service. No production enablement yet. */
export class CanvasTransport {
  readonly #url: URL;
  readonly #token: string;
  constructor(url: string, token: string, readonly origin: string, readonly bodyLimit = 350 * 1024 * 1024) {
    this.#url = new URL(url);
    if (this.#url.protocol !== 'http:' || this.#url.hostname !== '127.0.0.1' || this.#url.username || this.#url.password || this.#url.pathname !== '/' || this.#url.search || this.#url.hash || token.length < 32) {
      throw new Error('Invalid private canvas service configuration');
    }
    this.#token = token;
  }
  /** Trusted host-side metadata/write requests for ownership reconciliation. */
  json(path:string,method:'GET'|'POST'='GET',body?:string){return this.request(path,method,body,'application/json');}
  bytes(path:string,body:Buffer){return this.request(path,'POST',body,'application/octet-stream');}
  private async request(path:string,method:'GET'|'POST',body:string|Buffer|undefined,contentType:string):Promise<{status:number;data:any}>{
    const url=new URL(path,this.#url);
    if(url.origin!==this.#url.origin||/[%\\]/.test(path)||!routes.some(([allowed,pattern])=>allowed===method&&pattern.test(url.pathname)))throw new AppError(404,'画板接口不存在');
    let response:Response;
    const payload=typeof body==='string'||body===undefined?body:new Uint8Array(body.buffer,body.byteOffset,body.byteLength);
    try{response=await fetch(url,{method,headers:{Authorization:`Bearer ${this.#token}`,Origin:this.origin,'Content-Type':contentType},body:payload as BodyInit,signal:AbortSignal.timeout(30000)});}
    catch{throw new AppError(503,'画板服务暂不可用，已保存内容保留');}
    const chunks:Uint8Array[]=[];let size=0;
    if(response.body)for await(const chunk of response.body){size+=chunk.length;if(size>this.bodyLimit)throw new AppError(502,'画板响应过大');chunks.push(chunk);}
    try{return {status:response.status,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};}
    catch{throw new AppError(502,'画板服务返回无效数据');}
  }
  async forward(req: IncomingMessage, res: ServerResponse, path: string, browserOrigin: string) {
    const url = new URL(path, this.#url);
    if (!routes.some(([method, route]) => method === req.method && route.test(url.pathname)) ||
        /[%\\]/.test(path) || url.origin !== this.#url.origin ||
        [...url.searchParams.keys()].some(key => key !== 'revision') ||
        (url.search && (!/^\?revision=[1-9][0-9]*$/.test(url.search)))) throw new AppError(404, '画板接口不存在');
    if (req.method !== 'GET') {
      if (req.headers.origin !== browserOrigin) throw new AppError(403, '画板写入来源不被允许');
      const binary = new RegExp(`^/package-imports/${id}$`).test(url.pathname);
      if (req.headers['content-type']?.split(';')[0] !== (binary ? 'application/octet-stream' : 'application/json')) throw new AppError(415, '画板请求格式不支持');
    }
    if (Number(req.headers['content-length']) > this.bodyLimit) throw new AppError(413, '画板请求内容过大');
    await new Promise<void>((resolve, reject) => {
      let bytes = 0, finished = false;
      const limit = new Transform({ transform: (chunk, _encoding, callback) => {
        bytes += chunk.length;
        callback(bytes > this.bodyLimit ? new AppError(413, '画板请求内容过大') : null, chunk);
      } });
      const upstream = httpRequest(url, { method: req.method,
        headers: { Authorization: `Bearer ${this.#token}`, Origin: this.origin,
          ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}) } }, incoming => {
        res.writeHead(incoming.statusCode ?? 502, {
          'Content-Type': incoming.headers['content-type'] ?? 'application/json', 'Cache-Control': 'private, no-store',
          ...(incoming.headers['content-disposition'] ? { 'Content-Disposition': incoming.headers['content-disposition'] } : {}),
        });
        incoming.on('error', fail);
        incoming.pipe(res);
        incoming.once('end', () => finish());
      });
      const cleanup = () => { clearTimeout(timer); req.off('aborted', abort); res.off('close', closed); };
      const finish = (error?: Error) => {
        if (finished) return; finished = true; cleanup();
        if (error) reject(error); else resolve();
      };
      const fail = (error: Error) => { req.unpipe(limit); limit.unpipe(upstream); upstream.destroy(); finish(error instanceof AppError ? error : new AppError(503, '画板服务暂不可用，已保存内容保留')); };
      const abort = () => fail(new AppError(499, '画板请求已取消'));
      const closed = () => { if (!res.writableFinished) abort(); };
      const timer = setTimeout(() => fail(new AppError(504, '画板请求超时，请检查保存状态后重试')), 30000);
      req.once('aborted', abort); res.once('close', closed);
      upstream.on('error', fail); limit.on('error', fail);
      req.pipe(limit).pipe(upstream);
    });
  }
}

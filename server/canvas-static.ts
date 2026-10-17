import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from './store.js';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

/** Caller must authenticate first. This changes frame policy only for canvas resources. */
export async function serveCanvasStatic(req: IncomingMessage, res: ServerResponse, directory: string, pathname: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError(405, '画板资源只支持读取');
  if (!pathname.startsWith('/canvas/')) throw new AppError(404, '画板资源不存在');
  let child: string;
  try { child = decodeURIComponent(pathname.slice('/canvas/'.length)); }
  catch { throw new AppError(400, '画板资源路径无效'); }
  if (child.includes('\\') || child.includes('\0') || child.split('/').some(p => p === '..' || p === '.')) {
    throw new AppError(403, '画板资源路径不允许');
  }
  if (!child) child = 'index.html';
  const root = resolve(directory), target = resolve(root, child), local = relative(root, target);
  if (!local || isAbsolute(local) || local.startsWith('..') || resolve(root, local) !== target) throw new AppError(403, '画板资源路径不允许');
  const mime = types[extname(target)];
  // Do not serve source maps, credentials, service workers or arbitrary files from a build root.
  if (!mime || child === 'sw.js' || child.startsWith('workbox-')) throw new AppError(404, '画板资源不存在');
  let current = root;
  try {
    if ((await lstat(root)).isSymbolicLink()) throw new AppError(403, '画板资源不能引用外部链接');
    for (const part of local.split(sep)) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new AppError(403, '画板资源不能引用外部链接');
    }
    if (!(await lstat(target)).isFile()) throw new AppError(404, '画板资源不存在');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(404, '画板资源不存在');
  }
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; connect-src 'self' https://fonts.googleapis.com https://fonts.google.com https://fonts.gstatic.com https://api.fontsource.org https://cdn.jsdelivr.net; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  await pipeline(createReadStream(target), res);
}

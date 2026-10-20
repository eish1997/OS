import { openSync, closeSync, readSync, lstatSync, realpathSync, fstatSync, type BigIntStats } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { AppError } from './store.js';

export const nativeSessionMaximum = 128 * 1024 * 1024;
export function selectableBranchMessage(row:Record<string,unknown>){
  if(row.type!=='message')return false;
  const message=row.message as {role?:string;stopReason?:string;content?:unknown}|undefined;
  return message?.role==='user'||(message?.role==='assistant'&&['stop','length'].includes(message.stopReason??'')&&Array.isArray(message.content)&&!message.content.some(part=>part?.type==='toolCall'));
}
export interface NativeInspectionInput { path: string; sessionId: string; root: string; projectId: string }
export interface NativeInspectionResult { sha256: string; bytes: number; entryCount: number; fingerprint: string; workerPeakRss?: number; tornTailBytes?: number }
const stamp = (stat: BigIntStats) => [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
export function nativeFingerprint(input: NativeInspectionInput) {
  const folder = resolve(input.root, 'sessions', input.projectId); const target = resolve(input.path); const rel = relative(folder, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || dirname(target) !== folder || !target.endsWith('.jsonl')) throw new AppError(403, '原生会话路径超出项目范围');
  for (const candidate of [resolve(input.root), join(input.root,'sessions'), folder, target]) if (lstatSync(candidate).isSymbolicLink()) throw new AppError(403, '原生会话路径不能包含链接');
  if (realpathSync(target) !== target) throw new AppError(403, '原生会话路径归属不一致');
  const stat = lstatSync(target, { bigint: true });
  if (!stat.isFile() || stat.size > BigInt(nativeSessionMaximum)) throw new AppError(413, '原生会话超过128 MiB容量上限');
  return { fingerprint: stamp(stat), bytes: Number(stat.size) };
}

/** Streaming validation: retain only one JSONL record and entry IDs, never all history bodies. */
export function scanNative(input: NativeInspectionInput, onEntry?: (entry: Record<string, unknown>) => void): NativeInspectionResult {
  const before = nativeFingerprint(input); const fd = openSync(input.path, 'r');
  const digest = createHash('sha256'); const ids = new Set<string>(); const decoder = new TextDecoder('utf-8', { fatal: true });
  let entryCount = 0; let bytes = 0; let header = false; let trailingBlank = false; let tornTailBytes = 0;
  let pieces: Buffer[] = []; let pendingSize = 0;
  const consume = (line: Buffer, final = false) => {
    let text: string; try { text = decoder.decode(line).trim(); } catch { if (final && header) { tornTailBytes = line.length; return; } throw new AppError(422, '原生会话不是有效UTF-8，保留原件'); }
    if (!text) { if (header) trailingBlank = true; return; }
    if (trailingBlank) throw new AppError(422, '原生会话包含空条目，保留原件');
    let row: Record<string, unknown>;
    try { row = JSON.parse(text); if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(); } catch { if (final && header) { tornTailBytes = line.length; return; } throw new AppError(422, '原生会话内容损坏，保留原件'); }
    if (!header) {
      if (row.type !== 'session' || row.id !== input.sessionId || row.version !== 3) throw new AppError(422, '原生会话身份或版本不匹配');
      header = true; onEntry?.(row); return;
    }
    if (typeof row.id !== 'string' || ids.has(row.id) || (row.parentId !== null && !ids.has(row.parentId as string))) throw new AppError(422, '原生会话条目链损坏');
    ids.add(row.id); entryCount++; onEntry?.(row);
  };
  try {
    if (stamp(fstatSync(fd, { bigint: true })) !== before.fingerprint) throw new AppError(409, '原生会话读取前发生变化');
    const chunk = Buffer.allocUnsafe(256 * 1024);
    for (;;) {
      const length = readSync(fd, chunk, 0, chunk.length, null); if (!length) break;
      bytes += length; if (bytes > nativeSessionMaximum) throw new AppError(413, '原生会话超过128 MiB容量上限');
      digest.update(chunk.subarray(0, length));
      let start = 0;
      while (start < length) {
        const newline = chunk.indexOf(10, start); const end = newline >= 0 && newline < length ? newline : length;
        if (end > start) { const part = Buffer.from(chunk.subarray(start, end)); pieces.push(part); pendingSize += part.length; }
        if (end === length) break;
        consume(pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, pendingSize)); pieces = []; pendingSize = 0; start = end + 1;
      }
    }
    if (pendingSize) consume(pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, pendingSize), true);
    if (!header) throw new AppError(422, '原生会话缺少身份头');
    if (bytes !== before.bytes || stamp(fstatSync(fd, { bigint: true })) !== before.fingerprint || nativeFingerprint(input).fingerprint !== before.fingerprint) throw new AppError(409, '原生会话校验期间发生变化');
    const sha256 = digest.digest('hex');
    return tornTailBytes ? { ...before, sha256, entryCount, tornTailBytes } : { ...before, sha256, entryCount };
  } finally { closeSync(fd); }
}

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nativeFingerprint, type NativeInspectionInput, type NativeInspectionResult } from './native-inspection.js';
import { AppError } from './store.js';

const cache = new Map<string, NativeInspectionResult>();
let active = 0;
const queue: (() => void)[] = [];
export async function nativeInspectionSlot(signal?: AbortSignal): Promise<() => void> {
  signal?.throwIfAborted();
  return await new Promise((resolve, reject) => {
    const abort = () => { const index = queue.indexOf(start); if (index >= 0) queue.splice(index, 1); reject(new AppError(499, '会话校验已取消')); };
    const start = () => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) { reject(new AppError(499, '会话校验已取消')); queue.shift()?.(); return; }
      active++;
      resolve(() => { active--; queue.shift()?.(); });
    };
    if (active < 2) start(); else { queue.push(start); signal?.addEventListener('abort', abort, { once: true }); }
  });
}
const key = (input: NativeInspectionInput) => JSON.stringify(input);
export function cachedNative(input: NativeInspectionInput): NativeInspectionResult | undefined {
  const saved = cache.get(key(input));
  if (saved && saved.fingerprint === nativeFingerprint(input).fingerprint) return saved;
  cache.delete(key(input)); return undefined;
}
export function nativeNeedsPreparation(input: NativeInspectionInput) {
  return nativeFingerprint(input).bytes > 2 * 1024 * 1024 && !cachedNative(input);
}
export async function prepareNative(input: NativeInspectionInput, signal?: AbortSignal): Promise<NativeInspectionResult> {
  signal?.throwIfAborted();
  const saved = cachedNative(input); if (saved) return saved;
  const before = nativeFingerprint(input);
  const release = await nativeInspectionSlot(signal);
  try { return await new Promise<NativeInspectionResult>((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./native-inspection-worker.ts', import.meta.url)), [], { execArgv: ['--max-old-space-size=768', '--import', 'tsx'], windowsHide: true, stdio: ['ignore','ignore','ignore','ipc'], env: { ...process.env, PI_API_KEY: '', WORKBENCH_PASSWORD: '' } });
    let result: NativeInspectionResult | undefined; let failure: Error | undefined;
    const abort = () => { failure = new AppError(499, '会话校验已取消'); child.kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    child.on('message', (message: { result?: NativeInspectionResult; error?: string; status?: number }) => {
      if (message.error) failure = new AppError(message.status ?? 422, message.error);
      else result = message.result;
    });
    child.once('error', error => { failure = error; });
    child.once('close', code => {
      signal?.removeEventListener('abort', abort);
      if (failure) return reject(failure);
      if (code !== 0 || !result) return reject(new AppError(422, '会话校验进程未完成，保留原件'));
      try {
        if (result.fingerprint !== before.fingerprint || nativeFingerprint(input).fingerprint !== result.fingerprint) throw new AppError(409, '会话校验期间发生变化');
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(key(input), result); resolve(result);
      } catch (error) { reject(error); }
    });
    if (signal?.aborted) abort(); else child.send(input);
  }); } finally { release(); }
}

import { IncrementalSha256 } from '../../shared/sha256';

export const hashChunkBytes = 1024 * 1024;

/** Hash a local file in fixed slices. Abort between slices; do not read the whole file into one buffer. */
export async function hashFile(file: Blob, signal: AbortSignal, onProgress?: (read: number, total: number) => void) {
  const hash = new IncrementalSha256();
  for (let offset = 0; offset < file.size; offset += hashChunkBytes) {
    signal.throwIfAborted();
    const end = Math.min(file.size, offset + hashChunkBytes);
    hash.update(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
    onProgress?.(end, file.size);
    await new Promise(resolve => setTimeout(resolve, 0));
    signal.throwIfAborted();
  }
  return hash.digestHex();
}

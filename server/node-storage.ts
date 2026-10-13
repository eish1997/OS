import { writeFileSync, renameSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { StorageCapacity } from './storage.js';
import { AppError } from './store.js';
// Nodes may live on a different disk. A colocated node additionally shares host admission.
export class NodeStorage {
  readonly capacity: StorageCapacity;
  constructor(directory: string, maxBytes = 64 * 1024 ** 2, private host?: StorageCapacity, private checkpoint?: () => void) { this.capacity = new StorageCapacity(directory, { totalBytes:maxBytes, minFreeBytes:64*1024**2, controlReserveBytes: Math.min(1024*1024, Math.floor(maxBytes/8)) }); }
  write(path: string, content: string, exclusive = false, control = false) {
    const root=realpathSync(this.capacity.dataDir); const target=resolve(path); const parent=realpathSync(dirname(target));
    if (!target.startsWith(root+sep) || (parent !== root && !parent.startsWith(root+sep))) throw new AppError(403,'节点写入越出许可目录');
    const bytes = Buffer.byteLength(content);
    const save = () => this.capacity.write('workspaces', bytes, () => {
      if (control && !exclusive) { const pending=target+'.next'; writeFileSync(pending,content,{mode:0o600}); this.checkpoint?.(); renameSync(pending,target); }
      else writeFileSync(target, content, { flag:exclusive ? 'wx' : 'w', mode:0o600 });
    }, control);
    return this.host ? this.host.write(undefined, bytes, save, control) : save();
  }
}

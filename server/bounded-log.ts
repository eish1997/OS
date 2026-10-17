import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { StorageCapacity } from './storage.js';

export class BoundedLog {
  private dropped = 0;
  constructor(private capacity: StorageCapacity) { mkdirSync(join(capacity.dataDir, 'logs'), { recursive: true }); }
  record(category: 'scheduler_failure' | 'service_started' | 'service_stopping' | 'canvas_service_failed') {
    if (!['scheduler_failure','service_started','service_stopping','canvas_service_failed'].includes(category)) { this.dropped++; return; }
    const line = JSON.stringify({ at: new Date().toISOString(), category }) + '\n';
    try { this.capacity.write('logs', Buffer.byteLength(line), () => appendFileSync(join(this.capacity.dataDir, 'logs', 'host.jsonl'), line, { mode: 0o600 })); }
    catch { this.dropped++; } // Never delete assets or emit uncontrolled error payloads.
  }
  status() { return { droppedRecords: this.dropped, policy: 'stop appending at capacity; no automatic deletion', includesRawErrors: false }; }
}

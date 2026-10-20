import { existsSync, statSync } from 'node:fs';
import type { SessionManager } from '@earendil-works/pi-coding-agent';
import { StorageCapacity } from './storage.js';
import { nativeSessionMaximum } from './native-inspection.js';
import { AppError } from './store.js';

// Public persistence hook verified against pinned Pi 1.0.3. No SDK source modification.
// Only native append in the restricted M0 worker is enabled; migration/fork writers
// are not exposed as agent tools. First flush includes the buffered setup entries.
export function guardSessionPersistence(manager: SessionManager, capacity: StorageCapacity) {
  let failure: unknown;
  const assertHealthy = () => { if (failure) throw failure; };
  const persist = manager._persist.bind(manager);
  manager._persist = entry => {
    assertHealthy();
    if (!manager.isPersisted()) return persist(entry);
    const file = manager.getSessionFile(); if (!file) return persist(entry);
    const entries = manager.getEntries();
    if (!existsSync(file) && !entries.some(e => e.type === 'message' && ['user','assistant'].includes(e.message.role))) return persist(entry);
    const bytes = existsSync(file) ? Buffer.byteLength(JSON.stringify(entry) + '\n') : [manager.getHeader(), ...entries].reduce((n, value) => n + Buffer.byteLength(JSON.stringify(value) + '\n'), 0);
    try {
      if ((existsSync(file) ? statSync(file).size : 0) + bytes > nativeSessionMaximum) throw new AppError(507, '单会话达到128 MiB保存上限，既有历史保留');
      return capacity.write('sessions', bytes, () => persist(entry));
    } catch (error) { failure = error; throw error; }
  };
  return { assertHealthy };
}

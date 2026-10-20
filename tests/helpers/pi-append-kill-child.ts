import { appendFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { loadPi } from '../../server/pi-adapter.js';

const [cwd, sessionDir, progress] = process.argv.slice(2);
if (!cwd || !sessionDir || !progress) throw new Error('usage: pi-append-kill-child <cwd> <sessionDir> <progress>');
mkdirSync(cwd, { recursive: true });
mkdirSync(sessionDir, { recursive: true });
const pi = await loadPi();
const manager = pi.SessionManager.create(cwd, sessionDir);
const persist = manager._persist.bind(manager);
manager._persist = entry => {
  const message = (entry as { message?: { content?: unknown } }).message;
  const content = message && typeof message === 'object' ? message.content : undefined;
  if (content === 'KILL_THIS_ENTRY') {
    appendFileSync(manager.getSessionFile()!, JSON.stringify(entry).slice(0, 48));
    process.kill(process.pid, 'SIGKILL');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    throw new Error('Pi 写盘没有在半截记录处停止');
  }
  persist(entry);
};
manager.appendMessage({ role: 'user', content: 'PI_ANCHOR', timestamp: 1 });
writeFileSync(progress, JSON.stringify({ file: manager.getSessionFile(), sessionId: manager.getSessionId(), anchorBytes: statSync(manager.getSessionFile()!).size }));
manager.appendMessage({ role: 'user', content: 'KILL_THIS_ENTRY', timestamp: 2 });
writeFileSync(progress + '.finished', '1');

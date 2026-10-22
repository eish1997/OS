/**
 * Default offline guard: reject TCP to non-loopback hosts.
 * Loopback (127.0.0.1 / ::1 / localhost) remains allowed for the isolated app.
 */
import net from 'node:net';

const loopback = (host: string | undefined) => {
  if (!host) return false;
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
};

let blocked = 0;
const originalConnect = net.connect.bind(net);
const originalCreate = net.createConnection.bind(net);

function extractHost(args: unknown[]): string | undefined {
  const first = args[0];
  if (typeof first === 'object' && first && first !== null && 'host' in first) {
    return String((first as { host?: string }).host || '');
  }
  if (typeof first === 'number' && typeof args[1] === 'string') return args[1];
  return undefined;
}

function guarded(original: (...args: any[]) => net.Socket) {
  return (...args: any[]) => {
    const host = extractHost(args);
    if (host && !loopback(host)) {
      blocked += 1;
      const error = new Error(`CHAT_UI_OFFLINE_BLOCKED non-loopback connect to ${host}`);
      const socket = new net.Socket();
      const cb = args.find((arg) => typeof arg === 'function') as ((err?: Error) => void) | undefined;
      setImmediate(() => {
        if (cb) cb(error);
        socket.destroy(error);
      });
      return socket;
    }
    return original(...args);
  };
}

(net as { connect: typeof net.connect }).connect = guarded(originalConnect) as typeof net.connect;
(net as { createConnection: typeof net.createConnection }).createConnection = guarded(originalCreate) as typeof net.createConnection;

export function blockedExternalConnects() {
  return blocked;
}

/** Probe using the patched net binding in this module (named imports elsewhere may be stale). */
export function probeNonLoopbackBlocked(host = '1.1.1.1', port = 443): Promise<boolean> {
  return new Promise((resolve) => {
    const before = blocked;
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.on('error', (error) => finish(String(error.message).includes('CHAT_UI_OFFLINE_BLOCKED') || blocked > before));
    socket.on('connect', () => finish(false));
    setTimeout(() => finish(blocked > before), 500);
  });
}

import { rewriteForkInPlace } from '../../server/native-session.js';

const [path, sessionId] = process.argv.slice(2);
if (!path || !sessionId) throw new Error('usage: rewrite-midwrite-child <path> <sessionId>');
rewriteForkInPlace(path, sessionId);

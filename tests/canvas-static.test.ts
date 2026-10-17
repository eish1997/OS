import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

test('canvas static requires login and scopes frame/CSP policy without SPA fallback for missing resources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'canvas-static-'));
  const staticDir = join(root, 'ui'), canvasStaticDir = join(root, 'canvas');
  mkdirSync(staticDir); mkdirSync(canvasStaticDir);
  writeFileSync(join(staticDir, 'index.html'), '<main>workbench</main>');
  writeFileSync(join(canvasStaticDir, 'index.html'), '<main>canvas</main>');
  writeFileSync(join(canvasStaticDir, 'canvaskit.wasm'), new Uint8Array([0, 97, 115, 109]));
  writeFileSync(join(canvasStaticDir, 'sw.js'), 'bad scope');
  const app = createApp({ dataDir: join(root, 'data'), staticDir, canvasStaticDir, password: 'canvas-test-password', schedule: false });
  await new Promise<void>(done => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  try {
    assert.equal((await fetch(base + '/canvas/')).status, 401);
    const login = await fetch(base + '/api/login', { method: 'POST', body: JSON.stringify({ password: 'canvas-test-password' }) });
    assert.equal(login.status, 200);
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0] };
    const host = await fetch(base + '/', { headers });
    assert.equal(host.headers.get('x-frame-options'), 'DENY');
    const frame = await fetch(base + '/canvas/', { headers });
    assert.equal(frame.status, 200);
    assert.equal(await frame.text(), '<main>canvas</main>');
    assert.equal(frame.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(frame.headers.get('content-security-policy')!, /frame-ancestors 'self'/);
    const wasm = await fetch(base + '/canvas/canvaskit.wasm', { headers });
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.equal((await wasm.arrayBuffer()).byteLength, 4);
    for (const path of ['missing.js', 'sw.js', '%2e%2e%2fui%2findex.html', '%5c..%5cui%5cindex.html']) {
      assert([403, 404].includes((await fetch(base + '/canvas/' + path, { headers })).status), path);
    }
  } finally { await app.close(); }
});

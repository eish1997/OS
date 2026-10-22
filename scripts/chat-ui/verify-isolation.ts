import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { blockedExternalConnects, probeNonLoopbackBlocked } from './block-external.ts';
import { config } from '../../server/config.js';

const evidence = process.env.CHAT_UI_EVIDENCE || 'output/dev-evidence/chat-ui/loop-001';
mkdirSync(evidence, { recursive: true });

assert.equal(process.env.WORKBENCH_SKIP_DOTENV, '1');
assert.equal(process.env.CHAT_UI_ISOLATED, '1');
assert.equal(config.apiKey, 'offline-chat-ui-only');
assert.equal(config.model, 'gpt-5.6-sol');
assert.ok(config.dataDir.includes('chat-ui-isolate-') || process.env.CHAT_UI_DATA_ROOT);
assert.equal(config.offsite, undefined);
assert.equal(config.canvasPackageDir, undefined);

const externalBlocked = await probeNonLoopbackBlocked();
assert.equal(externalBlocked, true, 'non-loopback connect must be rejected');
assert.ok(blockedExternalConnects() >= 1);

const report = {
  at: new Date().toISOString(),
  isolated: true,
  skipDotenv: process.env.WORKBENCH_SKIP_DOTENV === '1',
  dataRootOwned: Boolean(process.env.CHAT_UI_DATA_ROOT),
  model: config.model,
  apiKeyIsOfflinePlaceholder: config.apiKey === 'offline-chat-ui-only',
  offsiteDisabled: config.offsite === undefined,
  canvasDisabled: config.canvasPackageDir === undefined,
  blockedExternalConnects: blockedExternalConnects(),
  realModelRequests: 0,
};
writeFileSync(join(evidence, 'isolation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, evidence: join(evidence, 'isolation.json'), blocked: blockedExternalConnects() }));

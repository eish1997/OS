import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPi } from '../server/pi-adapter.js';

const evidence = 'output/dev-evidence/pi-parity/loop-160';
mkdirSync(evidence, { recursive: true });

const pi = await loadPi();
const { InMemoryCredentialStore } = await import('@earendil-works/pi-ai');
const runtime = await pi.ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
  allowModelNetwork: false,
  refreshOnCreate: false,
});
const models = runtime.getModels('deepseek').map(model => ({
  id: model.id,
  name: model.name,
  reasoning: model.reasoning,
  input: model.input,
  thinkingLevelMap: model.thinkingLevelMap,
  cost: model.cost,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
  baseUrl: model.baseUrl,
}));
const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
if (!key) {
  writeFileSync(join(evidence, 'probe.json'), JSON.stringify({ models, live: null, note: 'no key in env' }, null, 2));
  console.log(JSON.stringify({ models, live: null }));
  process.exit(0);
}

const live: Array<{ id: string; status: number; ok: boolean; error?: string; usage?: unknown }> = [];
for (const model of models) {
  const reply = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: 'user', content: 'Reply with exactly: PING_OK' }],
      max_tokens: 16,
      stream: false,
    }),
  });
  const body = await reply.json() as { error?: { message?: string }; usage?: unknown; choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content ?? '';
  live.push({
    id: model.id,
    status: reply.status,
    ok: reply.ok && text.includes('PING_OK'),
    error: body.error?.message ? 'present' : undefined,
    usage: body.usage,
  });
  if (reply.ok) break;
}

writeFileSync(join(evidence, 'probe.json'), JSON.stringify({
  catalog: models,
  live,
  keyPresent: true,
  keyLength: key.length,
}, null, 2));
console.log(JSON.stringify({ catalogIds: models.map(m => m.id), live }, null, 2));

/**
 * Minimal live probe: does deepseek-flash actually accept and understand an image?
 * Key from PI_API_KEY / DEEPSEEK_API_KEY only. Never logs the key.
 * Filename/prompt do not contain the fixed visual answer.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { loadPi } from '../server/pi-adapter.js';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';

const evidence = 'output/dev-evidence/pi-parity/loop-170';
mkdirSync(evidence, { recursive: true });

const key = process.env.PI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
if (!key) {
  writeFileSync(join(evidence, 'vision-probe.json'), JSON.stringify({ ok: false, reason: 'no_key' }, null, 2));
  console.log(JSON.stringify({ ok: false, reason: 'no_key' }));
  process.exit(2);
}

/** Fixed acceptance answer — must NOT appear in filename, prompt, or image metadata. */
const EXPECTED = '4';
const FILE_NAME = 'canvas-probe.png';
const PROMPT = 'Look at the attached image. Reply with only the single large digit you see. No other words.';

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, checksum]);
}

/** Draw a blocky digit into RGB raw rows (filter byte 0 per row). */
function pngDigit(digit: string, width = 96, height = 128): Buffer {
  const pixels = Buffer.alloc(width * height * 3, 255);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  };
  const fillRect = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, 20, 20, 20);
  };
  // Digit "4": vertical stem, crossbar, right upright
  if (digit === '4') {
    fillRect(18, 16, 14, 70);
    fillRect(18, 70, 60, 14);
    fillRect(64, 16, 14, 96);
  } else {
    throw new Error('unsupported digit template');
  }
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const bytes = pngDigit(EXPECTED);
writeFileSync(join(evidence, FILE_NAME), bytes);

const pi = await loadPi();
const runtime = await pi.ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
  allowModelNetwork: false,
  refreshOnCreate: false,
});
await runtime.setRuntimeApiKey('deepseek', key);
const model = runtime.getModel('deepseek', 'deepseek-flash');
if (!model) {
  writeFileSync(join(evidence, 'vision-probe.json'), JSON.stringify({ ok: false, reason: 'model_missing' }, null, 2));
  console.log(JSON.stringify({ ok: false, reason: 'model_missing' }));
  process.exit(3);
}

const catalogImages = model.input.includes('image');
const b64 = bytes.toString('base64');
const dataUrl = `data:image/png;base64,${b64}`;

// Path A: raw OpenAI-compat request (proves provider API)
const rawStarted = Date.now();
const rawReply = await fetch('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'deepseek-flash',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 32,
    stream: false,
  }),
});
const rawBody = (await rawReply.json()) as {
  error?: { message?: string; type?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  choices?: Array<{ message?: { content?: string } }>;
};
const rawText = (rawBody.choices?.[0]?.message?.content ?? '').trim();
const rawMs = Date.now() - rawStarted;

// Path B: Pi streamSimple with ImageContent (proves Pi 1.0.3 image wiring)
let piText = '';
let piError: string | undefined;
let piUsage: unknown;
const piStarted = Date.now();
try {
  const stream = runtime.streamSimple(
    model,
    {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image', data: b64, mimeType: 'image/png' },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    { maxTokens: 32 },
  );
  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      const content = event.message.content;
      piText = Array.isArray(content)
        ? content.filter((p: { type: string }) => p.type === 'text').map((p: { type: string; text?: string }) => p.text ?? '').join('')
        : String(content ?? '');
      piUsage = event.message.usage;
    }
    if (event.type === 'error') piError = String((event as { error?: unknown }).error ?? 'stream_error');
  }
} catch (error) {
  piError = error instanceof Error ? error.message : String(error);
}
const piMs = Date.now() - piStarted;

const rawOk = rawReply.ok && rawText.includes(EXPECTED);
const piOk = !piError && piText.includes(EXPECTED);
const report = {
  purpose: 'F13 vision capability probe (not full workbench UI)',
  provider: 'deepseek',
  model: 'deepseek-flash',
  catalogListsImage: catalogImages,
  fileName: FILE_NAME,
  promptLeaksAnswer: PROMPT.includes(EXPECTED),
  fileNameLeaksAnswer: FILE_NAME.includes(EXPECTED),
  expectedDigit: EXPECTED,
  callsSpentThisProbe: (rawReply.status ? 1 : 0) + (piError && /auth|401|403/i.test(piError) && !piText ? 0 : 1),
  rawHttp: {
    status: rawReply.status,
    ok: rawReply.ok,
    text: rawText.slice(0, 200),
    matchesExpected: rawText.includes(EXPECTED),
    error: rawBody.error?.message ? 'present' : undefined,
    errorType: rawBody.error?.type,
    usage: rawBody.usage,
    ms: rawMs,
  },
  piStreamSimple: {
    ok: !piError,
    text: piText.slice(0, 200),
    matchesExpected: piText.includes(EXPECTED),
    error: piError ? 'present' : undefined,
    errorKind: piError ? piError.slice(0, 120) : undefined,
    usage: piUsage,
    ms: piMs,
  },
  visionCapable: rawOk || piOk,
  note: rawOk || piOk
    ? 'Provider returned the fixed visual answer; proceed to workbench UI acceptance'
    : 'Catalog image flag alone is insufficient; provider/Pi path failed to recognize the digit',
};

writeFileSync(join(evidence, 'vision-probe.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  visionCapable: report.visionCapable,
  catalogListsImage: report.catalogListsImage,
  raw: { status: rawReply.status, match: rawText.includes(EXPECTED), text: rawText.slice(0, 80) },
  pi: { ok: !piError, match: piText.includes(EXPECTED), text: piText.slice(0, 80), err: piError?.slice(0, 80) },
  expected: EXPECTED,
}, null, 2));
process.exit(report.visionCapable ? 0 : 4);

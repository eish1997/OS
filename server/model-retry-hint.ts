import { setTimeout as delay } from 'node:timers/promises';

export const retryHintLimitMs = 30000;
// Fixed Pi 1.0.3 adapters that actually accept an injected request fetch.
// Google/Vertex reject it and Bedrock does not use it; keep their transport intact.
export const supportsRetryHintFetch = (api: string) => ['openai-responses','openai-completions','azure-openai-responses','openai-codex-responses','anthropic-messages','mistral-conversations','pi-messages'].includes(api);

export function retryHintMs(headers: Headers, now = Date.now()): number {
  const millis = headers.get('retry-after-ms');
  const value = headers.get('retry-after');
  let requested = millis !== null && /^\d+(?:\.\d+)?$/.test(millis.trim()) ? Number(millis) : NaN;
  if (!Number.isFinite(requested) && value !== null) {
    requested = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  }
  return Number.isFinite(requested) ? Math.max(0, Math.min(retryHintLimitMs, Math.ceil(requested))) : 0;
}

/** This delays the next already-authorized retry; it never retries HTTP itself. */
export class ModelRetryHint {
  private until = 0;
  remaining() { return Math.max(0, this.until - Date.now()); }
  observe(response: Response) {
    if (response.status === 429 || response.status === 503) this.until = Math.max(this.until, Date.now() + retryHintMs(response.headers));
  }
  async wait(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const remaining = this.remaining();
    if (remaining) await delay(remaining, undefined, {signal});
  }
}

import { lazyStream } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { ModelUsage, Policy } from '../shared/contracts.js';
import { accountedStream } from './model-stream.js';
import { subscriptionPayload } from './subscription-request.js';
import { withModelIdleDeadline } from './model-idle.js';
import { ModelRetryHint, supportsRetryHintFetch } from './model-retry-hint.js';

import type { ModelRequestPurpose } from '../shared/pi-runtime.js';
export type { ModelRequestPurpose } from '../shared/pi-runtime.js';
export interface RuntimeAccounting {
  assertHealthy(): void;
  reserve(purpose: ModelRequestPurpose): Promise<{ apiKey: string; callNumber: number }>;
  settle(callNumber: number, cost: number | undefined, usage: ModelUsage | undefined): Promise<unknown>;
  started(callNumber: number): void;
  purpose?(): ModelRequestPurpose;
  phase?(phase: 'model_budget' | 'model_request' | 'model_idle_timeout' | 'model_backoff'): void;
}

/** Pi routes ordinary turns, compaction and branch summaries through this boundary. */
export function installAccountedRuntime(runtime: ModelRuntime, policy: Pick<Policy, 'maxOutputTokens' | 'modelBinding' | 'reservePerCallUsd' | 'piRuntime'>, hooks: RuntimeAccounting) {
  const original = runtime.streamSimple.bind(runtime);
  const retryHint = new ModelRetryHint();
  runtime.streamSimple = (model, context, options) => lazyStream(model, async () => {
    options?.signal?.throwIfAborted();
    if (retryHint.remaining()) { hooks.phase?.('model_backoff'); await retryHint.wait(options?.signal); }
    options?.signal?.throwIfAborted();
    hooks.assertHealthy();
    hooks.phase?.('model_budget');
    const maxTokens = Math.min(options?.maxTokens ?? policy.maxOutputTokens, policy.maxOutputTokens);
    const tiers = [model.cost, ...(model.cost.tiers ?? [])];
    const inputCeiling = Buffer.byteLength(JSON.stringify(context)) + 8192;
    const estimated = (inputCeiling * Math.max(...tiers.map(t => Math.max(t.input, t.cacheRead, t.cacheWrite))) + maxTokens * Math.max(...tiers.map(t => t.output))) / 1_000_000;
    if (policy.modelBinding?.kind !== 'chatgpt' && (!Number.isFinite(estimated) || estimated > policy.reservePerCallUsd)) throw new Error('单次预留不足以覆盖保守费用估算');
    const credential = await hooks.reserve(hooks.purpose?.() ?? 'agent');
    await runtime.setRuntimeApiKey(model.provider, credential.apiKey);
    hooks.phase?.('model_request');
    const underlyingFetch = options?.fetch ?? globalThis.fetch;
    const observedFetch: typeof fetch = async (...args) => { const response = await underlyingFetch(...args); retryHint.observe(response); return response; };
    const stream = (signal?: AbortSignal) => original(model, context, {
      ...options, signal, maxTokens, maxRetries: 0, env: {}, cacheRetention: 'none',
      fetch: policy.piRuntime?.autoRetry && supportsRetryHintFetch(model.api) ? observedFetch : options?.fetch,
      onPayload: policy.modelBinding?.kind === 'chatgpt' ? subscriptionPayload : options?.onPayload
    });
    const idle = policy.piRuntime?.networkIdleTimeoutMs;
    const source = idle ? withModelIdleDeadline(stream, options?.signal, idle, () => hooks.phase?.('model_idle_timeout')) : stream(options?.signal);
    return accountedStream(source, (cost, usage) => hooks.settle(credential.callNumber, cost, usage), () => hooks.started(credential.callNumber));
  });
  return { retryDelayMs: () => retryHint.remaining() };
}

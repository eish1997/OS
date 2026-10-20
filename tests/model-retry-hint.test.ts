import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRetryHint, retryHintMs, supportsRetryHintFetch } from '../server/model-retry-hint.js';

test('Retry-After dates, seconds and milliseconds are bounded; malformed hints and unsupported adapters are explicit',()=>{
  const now=Date.parse('2026-10-16T00:00:00Z');
  assert.equal(retryHintMs(new Headers({'retry-after':'2.5'}),now),2500);
  assert.equal(retryHintMs(new Headers({'retry-after-ms':'125','retry-after':'3'}),now),125);
  assert.equal(retryHintMs(new Headers({'retry-after':'Fri, 16 Oct 2026 00:00:04 GMT'}),now),4000);
  for(const value of ['nonsense','-2',''])assert.equal(retryHintMs(new Headers({'retry-after':value}),now),0);
  assert.equal(retryHintMs(new Headers({'retry-after':'999999'}),now),30000);
  assert.equal(retryHintMs(new Headers({'retry-after-ms':'NaN','retry-after':'2'}),now),2000);
  assert.equal(supportsRetryHintFetch('google-generative-ai'),false);
  assert.equal(supportsRetryHintFetch('google-vertex'),false);
  assert.equal(supportsRetryHintFetch('bedrock-converse-stream'),false);
  assert.equal(supportsRetryHintFetch('openai-responses'),true);
});

test('hint waiting is cancellable and successful responses do not introduce a delay',async()=>{
  const hint=new ModelRetryHint();hint.observe(new Response('',{status:200,headers:{'retry-after':'30'}}));assert.equal(hint.remaining(),0);
  hint.observe(new Response('',{status:503,headers:{'retry-after':'30'}}));
  assert(hint.remaining()>29000);const controller=new AbortController();const pending=hint.wait(controller.signal);
  controller.abort();await assert.rejects(pending,{name:'AbortError'});
});

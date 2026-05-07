/**
 * Tests for the paywall handling in providerStreamClient.ts.
 *
 * Covers:
 *   - 429 + { kind:'paywall', feature, requiredTier, reason } yields a paywall chunk
 *   - 429 + { kind:'paywall', ... } without `reason` yields paywall chunk with no reason field
 *   - 429 without a paywall body yields a normal error chunk
 *   - 429 with non-JSON body yields a normal error chunk
 *   - 429 with JSON but wrong `kind` yields a normal error chunk
 *   - 200 + SSE frames still work normally (regression guard)
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { streamFromProvider, type StreamChunk } from '../src/providerStreamClient.ts';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchReturning(status: number, body: string): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: null, // overridden below for streaming tests
    text: () => Promise.resolve(body),
  });
}

function makeFetchWithSseBody(sseText: string): typeof fetch {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(sseText);
  let offset = 0;
  const body = {
    getReader() {
      return {
        read(): Promise<{ value: Uint8Array | undefined; done: boolean }> {
          if (offset < encoded.length) {
            const chunk = encoded.slice(offset);
            offset = encoded.length;
            return Promise.resolve({ value: chunk, done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
        releaseLock() {},
      };
    },
  };
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body,
    text: () => Promise.resolve(sseText),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Base params used across all tests
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  gatewayUrl: 'https://api.agiworkforce.com',
  providerId: 'anthropic' as const,
  authToken: 'test-jwt',
  request: { model: 'claude-sonnet-4-6', messages: [] },
};

// ---------------------------------------------------------------------------
// Helper: collect all chunks from the async generator
// ---------------------------------------------------------------------------

async function collectChunks(
  fetchImpl: typeof fetch,
  params = BASE_PARAMS,
): Promise<StreamChunk[]> {
  vi.stubGlobal('fetch', fetchImpl);
  const chunks: StreamChunk[] = [];
  for await (const chunk of streamFromProvider(params)) {
    chunks.push(chunk);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Paywall detection tests
// ---------------------------------------------------------------------------

describe('streamFromProvider — 429 paywall detection', () => {
  it('yields a paywall chunk when 429 body has kind:paywall with feature + requiredTier', async () => {
    const paywallBody = JSON.stringify({
      kind: 'paywall',
      feature: 'token_cap',
      requiredTier: 'pro',
      reason: '2M token monthly cap reached',
    });
    const chunks = await collectChunks(makeFetchReturning(429, paywallBody));

    expect(chunks[0]).toMatchObject({
      type: 'paywall',
      feature: 'token_cap',
      requiredTier: 'pro',
      reason: '2M token monthly cap reached',
    });
    expect(chunks[1]).toMatchObject({ type: 'stop', reason: 'error' });
    expect(chunks).toHaveLength(2);
  });

  it('yields a paywall chunk without reason when reason is absent from the body', async () => {
    const paywallBody = JSON.stringify({
      kind: 'paywall',
      feature: 'image_quota',
      requiredTier: 'hobby',
    });
    const chunks = await collectChunks(makeFetchReturning(429, paywallBody));

    const paywallChunk = chunks[0];
    expect(paywallChunk).toMatchObject({
      type: 'paywall',
      feature: 'image_quota',
      requiredTier: 'hobby',
    });
    // reason should not be present (or undefined) when not in the payload
    expect((paywallChunk as { reason?: string }).reason).toBeUndefined();
  });

  it('yields paywall chunk for every PaywallFeature value', async () => {
    const features = [
      'video_generation',
      'opus_4_7',
      'gpt_5_5',
      'computer_use',
      'deep_research',
      'image_quota',
      'token_cap',
      'mcp',
      'web_search',
    ] as const;
    for (const feature of features) {
      const body = JSON.stringify({ kind: 'paywall', feature, requiredTier: 'max' });
      const chunks = await collectChunks(makeFetchReturning(429, body));
      expect(chunks[0]).toMatchObject({ type: 'paywall', feature, requiredTier: 'max' });
    }
  });

  it('yields paywall chunk for every PaywallRequiredTier value', async () => {
    const tiers = ['hobby', 'pro', 'pro_plus', 'max'] as const;
    for (const requiredTier of tiers) {
      const body = JSON.stringify({ kind: 'paywall', feature: 'token_cap', requiredTier });
      const chunks = await collectChunks(makeFetchReturning(429, body));
      expect(chunks[0]).toMatchObject({ type: 'paywall', feature: 'token_cap', requiredTier });
    }
  });

  it('does NOT yield a paywall chunk when 429 body is not JSON', async () => {
    const chunks = await collectChunks(makeFetchReturning(429, 'Rate limit exceeded'));

    expect(chunks[0]).toMatchObject({ type: 'error', message: 'Rate limit exceeded' });
    // No paywall chunk
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('does NOT yield a paywall chunk when 429 body JSON has wrong kind', async () => {
    const body = JSON.stringify({ kind: 'downgrade', modelOverride: 'gemini-3.1-flash-lite' });
    const chunks = await collectChunks(makeFetchReturning(429, body));

    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('does NOT yield a paywall chunk when 429 body JSON is missing feature', async () => {
    const body = JSON.stringify({ kind: 'paywall', requiredTier: 'pro' });
    const chunks = await collectChunks(makeFetchReturning(429, body));

    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('does NOT yield a paywall chunk when 429 body JSON is missing requiredTier', async () => {
    const body = JSON.stringify({ kind: 'paywall', feature: 'token_cap' });
    const chunks = await collectChunks(makeFetchReturning(429, body));

    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('does NOT yield a paywall chunk for non-429 error status codes', async () => {
    // 503 should still be a retryable error, not a paywall
    const body = JSON.stringify({ kind: 'paywall', feature: 'token_cap', requiredTier: 'pro' });
    const chunks = await collectChunks(makeFetchReturning(503, body));

    expect(chunks[0]).toMatchObject({ type: 'error', retryable: true });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });

  it('does NOT yield a paywall chunk for 429 with an empty body', async () => {
    const chunks = await collectChunks(makeFetchReturning(429, ''));

    expect(chunks[0]).toMatchObject({ type: 'error', message: 'Upstream error 429' });
    expect(chunks.some((c) => c.type === 'paywall')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Normal streaming regression guard
// ---------------------------------------------------------------------------

describe('streamFromProvider — normal SSE streaming (regression)', () => {
  it('yields text-delta chunks from a 200 SSE response', async () => {
    const sseText =
      'data: {"type":"text-delta","delta":"Hello"}\n\n' +
      'data: {"type":"text-delta","delta":" world"}\n\n' +
      'data: {"type":"stop","reason":"end_turn"}\n\n';

    const chunks = await collectChunks(makeFetchWithSseBody(sseText));

    expect(chunks[0]).toMatchObject({ type: 'text-delta', delta: 'Hello' });
    expect(chunks[1]).toMatchObject({ type: 'text-delta', delta: ' world' });
    expect(chunks[2]).toMatchObject({ type: 'stop', reason: 'end_turn' });
  });

  it('stops when [DONE] sentinel is received', async () => {
    const sseText = 'data: {"type":"text-delta","delta":"Hi"}\n\n' + 'data: [DONE]\n\n';

    const chunks = await collectChunks(makeFetchWithSseBody(sseText));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'text-delta', delta: 'Hi' });
  });
});

import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { createGoogleAdapter } from '../index';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

const FAKE_KEY = 'AIzaSy-FAKE-TEST-KEY-DO-NOT-LEAK';

interface CapturedCall {
  url: string;
}

function makeMockFetch(): { fetch: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const mockFetch: typeof fetch = async (input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url });
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{}}\n\n',
            ),
          );
          controller.close();
        },
      }),
      { status: 200 },
    );
  };
  return { fetch: mockFetch, calls };
}

async function streamOnce(baseUrl: string, mockFetch: typeof fetch): Promise<void> {
  const adapter = createGoogleAdapter({ apiKey: FAKE_KEY, baseUrl, fetch: mockFetch });
  const req: ChatRequest = {
    model: GOOGLE_DEFAULT_MODEL_ID,
    messages: [{ role: 'user', content: 'hi' }],
  };
  for await (const _ of adapter.stream(req, new AbortController().signal)) {
    void _;
  }
}

describe('Google adapter base URL normalization', () => {
  it('strips a single trailing slash', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch();
    await streamOnce('https://gateway.example.com/google/', mockFetch);
    expect(calls[0]?.url).toBe(
      `https://gateway.example.com/google/v1beta/models/${GOOGLE_DEFAULT_MODEL_ID}:streamGenerateContent?alt=sse`,
    );
  });

  it('strips many trailing slashes', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch();
    await streamOnce(`https://gateway.example.com/google${'/'.repeat(50)}`, mockFetch);
    expect(calls[0]?.url).toBe(
      `https://gateway.example.com/google/v1beta/models/${GOOGLE_DEFAULT_MODEL_ID}:streamGenerateContent?alt=sse`,
    );
  });

  it('leaves a bare host untouched', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch();
    await streamOnce('https://gateway.example.com/google', mockFetch);
    expect(calls[0]?.url).toBe(
      `https://gateway.example.com/google/v1beta/models/${GOOGLE_DEFAULT_MODEL_ID}:streamGenerateContent?alt=sse`,
    );
  });

  it('collapses a baseUrl already carrying /v1beta with trailing slashes', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch();
    await streamOnce(`https://gateway.example.com/google/v1beta${'/'.repeat(10)}`, mockFetch);
    expect(calls[0]?.url).toBe(
      `https://gateway.example.com/google/v1beta/models/${GOOGLE_DEFAULT_MODEL_ID}:streamGenerateContent?alt=sse`,
    );
  });

  it('normalizes an adversarial run of thousands of trailing slashes in well under a second', () => {
    const adversarial = `https://gateway.example.com/google${'/'.repeat(50_000)}`;
    const started = performance.now();
    const adapter = createGoogleAdapter({ apiKey: FAKE_KEY, baseUrl: adversarial });
    const elapsedMs = performance.now() - started;

    expect(adapter).toBeDefined();
    expect(elapsedMs).toBeLessThan(1000);
  });

  it('normalizes a pathological alternating slash pattern in well under a second', () => {
    const adversarial = `https://gateway.example.com${'/x'.repeat(20_000)}${'/'.repeat(20_000)}`;
    const started = performance.now();
    const adapter = createGoogleAdapter({ apiKey: FAKE_KEY, baseUrl: adversarial });
    const elapsedMs = performance.now() - started;

    expect(adapter).toBeDefined();
    expect(elapsedMs).toBeLessThan(1000);
  });
});

import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { createGoogleAdapter } from '../index';
import { fetchGoogleCatalog } from '../catalog';
import { GOOGLE_DEFAULT_MODEL_ID } from './model-fixtures';

const FAKE_KEY = 'AIzaSy-FAKE-TEST-KEY-DO-NOT-LEAK';

interface CapturedCall {
  url: string;
  init: RequestInit | undefined;
}

function makeMockFetch(responseFactory: () => Response): {
  fetch: typeof fetch;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return responseFactory();
  };
  return { fetch: mockFetch, calls };
}

function emptySseBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode('data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{}}\n\n'),
      );
      controller.close();
    },
  });
}

describe('Google adapter API key transport', () => {
  it('stream() sends the key in x-goog-api-key header, never in the URL', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch(
      () => new Response(emptySseBody(), { status: 200 }),
    );

    const adapter = createGoogleAdapter({ apiKey: FAKE_KEY, fetch: mockFetch });
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'hello' }],
    };

    const ac = new AbortController();
    for await (const _ of adapter.stream(req, ac.signal)) {
      void _;
    }

    expect(calls).toHaveLength(1);
    const call = calls[0]!;

    expect(call.url).not.toContain(FAKE_KEY);
    expect(call.url).not.toMatch(/[?&]key=/);
    const headers = new Headers(call.init?.headers);
    expect(headers.get('x-goog-api-key')).toBe(FAKE_KEY);
    const passedSignal = call.init?.signal;
    expect(passedSignal).toBeInstanceOf(AbortSignal);
    expect(passedSignal?.aborted).toBe(false);
    ac.abort();
    expect(passedSignal?.aborted).toBe(true);
    expect(call.init?.method).toBe('POST');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('stream() respects baseUrl override without leaking the key into the URL', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch(
      () => new Response(emptySseBody(), { status: 200 }),
    );

    const adapter = createGoogleAdapter({
      apiKey: FAKE_KEY,
      baseUrl: 'https://my-proxy.example.com/v1beta-relay',
      fetch: mockFetch,
    });
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
    };

    for await (const _ of adapter.stream(req, new AbortController().signal)) {
      void _;
    }

    const call = calls[0]!;
    expect(call.url.startsWith('https://my-proxy.example.com/v1beta-relay/')).toBe(true);
    expect(call.url).not.toContain(FAKE_KEY);
    expect(call.url).not.toMatch(/[?&]key=/);
    expect(new Headers(call.init?.headers).get('x-goog-api-key')).toBe(FAKE_KEY);
  });

  it('stream() builds the same request URL for a bare-host baseUrl and one already carrying /v1beta', async () => {
    const bare = makeMockFetch(() => new Response(emptySseBody(), { status: 200 }));
    const versioned = makeMockFetch(() => new Response(emptySseBody(), { status: 200 }));
    const req: ChatRequest = {
      model: GOOGLE_DEFAULT_MODEL_ID,
      messages: [{ role: 'user', content: 'hi' }],
    };

    const bareAdapter = createGoogleAdapter({
      apiKey: FAKE_KEY,
      baseUrl: 'https://gateway.example.com/google',
      fetch: bare.fetch,
    });
    for await (const _ of bareAdapter.stream(req, new AbortController().signal)) {
      void _;
    }

    const versionedAdapter = createGoogleAdapter({
      apiKey: FAKE_KEY,
      baseUrl: 'https://gateway.example.com/google/v1beta',
      fetch: versioned.fetch,
    });
    for await (const _ of versionedAdapter.stream(req, new AbortController().signal)) {
      void _;
    }

    const expectedUrl = `https://gateway.example.com/google/v1beta/models/${GOOGLE_DEFAULT_MODEL_ID}:streamGenerateContent?alt=sse`;
    expect(bare.calls[0]?.url).toBe(expectedUrl);
    expect(versioned.calls[0]?.url).toBe(expectedUrl);
    expect(versioned.calls[0]?.url).not.toContain('/v1beta/v1beta/');
  });

  it('fetchGoogleCatalog() sends the key in x-goog-api-key header, never in the URL', async () => {
    const { fetch: mockFetch, calls } = makeMockFetch(
      () =>
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await fetchGoogleCatalog({ apiKey: FAKE_KEY, fetch: mockFetch });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).not.toContain(FAKE_KEY);
    expect(call.url).not.toMatch(/[?&]key=/);
    expect(new Headers(call.init?.headers).get('x-goog-api-key')).toBe(FAKE_KEY);
  });
});

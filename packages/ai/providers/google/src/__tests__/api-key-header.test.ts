/**
 * Regression test: the Google adapter must send the API key via the
 * `x-goog-api-key` HTTP header — never as a `?key=...` query string.
 *
 * Why: a key in the URL leaks into:
 *   - server access logs (most reverse proxies log full URLs)
 *   - browser history (web targets via the `fetch` polyfill chain)
 *   - HTTP `Referer` headers when the request triggers a redirect
 *   - any HTTPS-terminating proxy in the path (corporate MITM, devtools)
 *
 * The fix uses the documented header path. This test exercises both the
 * `stream()` entrypoint and `fetchGoogleCatalog()` to catch any future
 * regression at either site.
 */

import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '@agiworkforce/types';

import { createGoogleAdapter } from '../index';
import { fetchGoogleCatalog } from '../catalog';

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
      // One minimal SSE frame so the parser has something to terminate on.
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
      model: 'gemini-3.1-pro-preview',
      messages: [{ role: 'user', content: 'hello' }],
    };

    const ac = new AbortController();
    // Drain the stream so the fetch call actually fires.
    for await (const _ of adapter.stream(req, ac.signal)) {
      void _;
    }

    expect(calls).toHaveLength(1);
    const call = calls[0]!;

    // URL must NOT carry the key.
    expect(call.url).not.toContain(FAKE_KEY);
    expect(call.url).not.toMatch(/[?&]key=/);
    // Header MUST carry the key.
    const headers = new Headers(call.init?.headers);
    expect(headers.get('x-goog-api-key')).toBe(FAKE_KEY);
    // signal must propagate so cancellation works through the wire.
    expect(call.init?.signal).toBe(ac.signal);
    // Body shape sanity: POST with a JSON content-type.
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
      model: 'gemini-3.1-pro-preview',
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

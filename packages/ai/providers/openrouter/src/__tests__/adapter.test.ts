import { describe, expect, it } from 'vitest';

import { createOpenRouterAdapter, OPENROUTER_MODEL_CATALOG } from '../index';

describe('createOpenRouterAdapter', () => {
  it('returns adapter with id="open_router" and label="OpenRouter"', () => {
    const adapter = createOpenRouterAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('open_router');
    expect(adapter.label).toBe('OpenRouter');
  });

  it('declares an api-key auth method with envVar OPENROUTER_API_KEY', () => {
    const adapter = createOpenRouterAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('OPENROUTER_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createOpenRouterAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models).toEqual(OPENROUTER_MODEL_CATALOG);
  });

  it('constructs with default attribution headers', () => {
    expect(() => createOpenRouterAdapter({ apiKey: 'test-key' })).not.toThrow();
  });

  it('constructs with custom siteUrl/appTitle attribution headers', () => {
    expect(() =>
      createOpenRouterAdapter({
        apiKey: 'test-key',
        siteUrl: 'https://example.com',
        appTitle: 'Example App',
      }),
    ).not.toThrow();
  });

  it('constructs with anthropicCacheRetention overrides', () => {
    expect(() =>
      createOpenRouterAdapter({ apiKey: 'test-key', anthropicCacheRetention: 'none' }),
    ).not.toThrow();
    expect(() =>
      createOpenRouterAdapter({ apiKey: 'test-key', anthropicCacheRetention: 'long' }),
    ).not.toThrow();
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createOpenRouterAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });

  it('retries when the router finds no endpoint in its sampled pool, then streams', async () => {
    let calls = 0;
    const poolExhausted = JSON.stringify({
      error: {
        code: 404,
        message:
          '0 endpoints out of 8 requested are available matching your guardrail restrictions and data policy.',
      },
    });
    const adapter = createOpenRouterAdapter({
      apiKey: 'test-key',
      fetch: async () => {
        calls += 1;
        if (calls < 3) {
          return new Response(poolExhausted, {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(
          'data: {"id":"x","choices":[{"index":0,"delta":{"content":"ready"}}]}\n\ndata: [DONE]\n\n',
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      },
    });
    const chunks: string[] = [];
    for await (const chunk of adapter.stream(
      { model: 'router/example-model', messages: [{ role: 'user', content: 'hi' }] },
      new AbortController().signal,
    )) {
      chunks.push(chunk.type);
    }
    expect(calls).toBe(3);
    expect(chunks).not.toContain('error');
  });

  it('gives up after the retry budget when every sampled pool is empty', async () => {
    let calls = 0;
    const adapter = createOpenRouterAdapter({
      apiKey: 'test-key',
      fetch: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            error: { code: 404, message: '0 endpoints out of 5 requested are available' },
          }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      },
    });
    const chunks: string[] = [];
    for await (const chunk of adapter.stream(
      { model: 'router/example-model', messages: [{ role: 'user', content: 'hi' }] },
      new AbortController().signal,
    )) {
      chunks.push(chunk.type);
    }
    expect(calls).toBe(3);
    expect(chunks).toContain('error');
  });

  it('sends no provider routing field on the wire when providerRouting is unset (never forces ordering by default)', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createOpenRouterAdapter({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        seenBody = JSON.parse(String(init?.body));
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });
    for await (const _c of adapter.stream(
      { model: 'anthropic/example-model', messages: [{ role: 'user', content: 'hi' }] },
      new AbortController().signal,
    )) {
      void _c;
    }
    expect(seenBody?.provider).toBeUndefined();
  });

  it('sends the configured provider routing preferences on the wire, overridable by request metadata', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createOpenRouterAdapter({
      apiKey: 'test-key',
      providerRouting: { order: ['anthropic'], dataCollection: 'deny' },
      fetch: async (_input, init) => {
        seenBody = JSON.parse(String(init?.body));
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });
    for await (const _c of adapter.stream(
      {
        model: 'anthropic/example-model',
        messages: [{ role: 'user', content: 'hi' }],
        metadata: { openRouterProviderRouting: { order: ['together'] } },
      },
      new AbortController().signal,
    )) {
      void _c;
    }
    expect(seenBody?.provider).toEqual({ order: ['together'], data_collection: 'deny' });
  });
});

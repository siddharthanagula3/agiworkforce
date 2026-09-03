import { describe, expect, it } from 'vitest';

import { createVercelGatewayAdapter } from '../index';

const VERCEL_GATEWAY_API_KEY_ENV_VAR = 'VERCEL_GATEWAY_API_KEY';
const VERCEL_GATEWAY_HOST = 'ai-gateway.vercel.sh';

describe('createVercelGatewayAdapter', () => {
  it('returns an adapter with id="vercel_gateway"', () => {
    const adapter = createVercelGatewayAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('vercel_gateway');
    expect(adapter.label).toBe('Vercel AI Gateway');
  });

  it(`declares an api-key auth method with envVar ${VERCEL_GATEWAY_API_KEY_ENV_VAR}`, () => {
    const adapter = createVercelGatewayAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe(VERCEL_GATEWAY_API_KEY_ENV_VAR);
    }
  });

  it('defaults to the Vercel AI Gateway endpoint', async () => {
    let seenUrl: string | undefined;
    const adapter = createVercelGatewayAdapter({
      apiKey: 'test-key',
      fetch: async (input) => {
        seenUrl = String(input);
        return new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    });

    for await (const _chunk of adapter.stream(
      { model: 'any-model', messages: [{ role: 'user', content: 'ping' }] },
      new AbortController().signal,
    )) {
      void _chunk;
    }

    expect(seenUrl).toContain(VERCEL_GATEWAY_HOST);
  });

  it('reports every curated catalog entry against its own provider id', async () => {
    const adapter = createVercelGatewayAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    for (const m of models) {
      expect(m.provider).toBe('vercel_gateway');
    }
  });

  it('sends no providerOptions field on the wire when providerOptions is unset (never forces caching or routing by default)', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createVercelGatewayAdapter({
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
      { model: 'anthropic/claude-opus-5', messages: [{ role: 'user', content: 'hi' }] },
      new AbortController().signal,
    )) {
      void _c;
    }
    expect(seenBody?.providerOptions).toBeUndefined();
  });

  it('sends the configured providerOptions.gateway preferences on the wire, overridable by request metadata', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createVercelGatewayAdapter({
      apiKey: 'test-key',
      providerOptions: { caching: 'auto', order: ['anthropic'] },
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
        model: 'anthropic/claude-opus-5',
        messages: [{ role: 'user', content: 'hi' }],
        metadata: { vercelGatewayProviderOptions: { order: ['vertex'] } },
      },
      new AbortController().signal,
    )) {
      void _c;
    }
    expect(seenBody?.providerOptions).toEqual({ gateway: { caching: 'auto', order: ['vertex'] } });
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createVercelGatewayAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';

import { createZhipuAdapter } from '../index';

describe('createZhipuAdapter', () => {
  it('returns adapter with id="zhipu" and label="ZhipuAI"', () => {
    const adapter = createZhipuAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('zhipu');
    expect(adapter.label).toBe('ZhipuAI');
  });

  it('declares an api-key auth method with envVar ZHIPU_API_KEY', () => {
    const adapter = createZhipuAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('ZHIPU_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createZhipuAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('zhipu');
    }
  });

  it('accepts the api.z.ai alternate host', () => {
    expect(() =>
      createZhipuAdapter({ apiKey: 'test-key', baseUrl: 'https://api.z.ai/v1' }),
    ).not.toThrow();
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createZhipuAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });

  it('requests stream_options.include_usage=true on the wire', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createZhipuAdapter({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        seenBody = JSON.parse(String(init?.body));
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

    expect(
      (seenBody?.stream_options as { include_usage?: boolean } | undefined)?.include_usage,
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { createGroqAdapter } from '../index';

const GROQ_API_KEY_ENV_VAR = 'GROQ_API_KEY';
const GROQ_HOST = 'api.groq.com';

describe('createGroqAdapter', () => {
  it('returns an adapter with id="groq" and label="Groq"', () => {
    const adapter = createGroqAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('groq');
    expect(adapter.label).toBe('Groq');
  });

  it(`declares an api-key auth method with envVar ${GROQ_API_KEY_ENV_VAR}`, () => {
    const adapter = createGroqAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe(GROQ_API_KEY_ENV_VAR);
    }
  });

  it('defaults to the Groq OpenAI-compatible endpoint', async () => {
    let seenUrl: string | undefined;
    const adapter = createGroqAdapter({
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

    expect(seenUrl).toContain(GROQ_HOST);
  });

  it('reports every curated catalog entry against its own provider id', async () => {
    const adapter = createGroqAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    for (const m of models) {
      expect(m.provider).toBe('groq');
    }
  });

  it('requests stream_options.include_usage=true on the wire', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createGroqAdapter({
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

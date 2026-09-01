import { describe, expect, it } from 'vitest';

import { createWorkersAiAdapter } from '../index';

const WORKERS_AI_API_KEY_ENV_VAR = 'WORKERS_AI_API_KEY';
const WORKERS_AI_TEST_BASE_URL =
  'https://gateway.ai.cloudflare.com/v1/test-account/test-gateway/workers-ai/v1';

describe('createWorkersAiAdapter', () => {
  it('returns an adapter with id="workers_ai"', () => {
    const adapter = createWorkersAiAdapter({
      apiKey: 'test-key',
      baseUrl: WORKERS_AI_TEST_BASE_URL,
    });
    expect(adapter.id).toBe('workers_ai');
    expect(adapter.label).toBe('Cloudflare Workers AI');
  });

  it(`declares an api-key auth method with envVar ${WORKERS_AI_API_KEY_ENV_VAR}`, () => {
    const adapter = createWorkersAiAdapter({
      apiKey: 'test-key',
      baseUrl: WORKERS_AI_TEST_BASE_URL,
    });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe(WORKERS_AI_API_KEY_ENV_VAR);
    }
  });

  it('refuses to construct without a base URL, because the endpoint is account-scoped', () => {
    expect(() => createWorkersAiAdapter({ apiKey: 'test-key' })).toThrow(
      /requires an explicit baseUrl/,
    );
  });

  it('names the base-URL environment variable in the misconfiguration error', () => {
    expect(() => createWorkersAiAdapter({ apiKey: 'test-key' })).toThrow(/WORKERS_AI_BASE_URL/);
  });

  it('routes requests through the account-scoped gateway base URL', async () => {
    let seenUrl: string | undefined;
    const adapter = createWorkersAiAdapter({
      apiKey: 'test-key',
      baseUrl: WORKERS_AI_TEST_BASE_URL,
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

    expect(seenUrl).toBe(`${WORKERS_AI_TEST_BASE_URL}/chat/completions`);
  });
});

import { describe, expect, it } from 'vitest';

import { createNvidiaAdapter } from '../index';

const NVIDIA_API_KEY_ENV_VAR = 'NVIDIA_NIM_API_KEY';
const NVIDIA_HOST = 'integrate.api.nvidia.com';

describe('createNvidiaAdapter', () => {
  it('returns an adapter with id="nvidia_nim" and label="NVIDIA NIM"', () => {
    const adapter = createNvidiaAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('nvidia_nim');
    expect(adapter.label).toBe('NVIDIA NIM');
  });

  it(`declares an api-key auth method with envVar ${NVIDIA_API_KEY_ENV_VAR}`, () => {
    const adapter = createNvidiaAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe(NVIDIA_API_KEY_ENV_VAR);
    }
  });

  it('defaults to the NVIDIA NIM integrate endpoint', async () => {
    let seenUrl: string | undefined;
    const adapter = createNvidiaAdapter({
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

    expect(seenUrl).toContain(NVIDIA_HOST);
  });

  it('reports every curated catalog entry against its own provider id', async () => {
    const adapter = createNvidiaAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    for (const m of models) {
      expect(m.provider).toBe('nvidia_nim');
    }
  });
});

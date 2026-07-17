/**
 * Adapter contract test: createZhipuAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction.
 */

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
});

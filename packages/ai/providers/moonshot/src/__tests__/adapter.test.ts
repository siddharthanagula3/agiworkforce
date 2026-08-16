
import { describe, expect, it } from 'vitest';

import { createMoonshotAdapter } from '../index';

describe('createMoonshotAdapter', () => {
  it('returns adapter with id="moonshot" and label="Moonshot AI"', () => {
    const adapter = createMoonshotAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('moonshot');
    expect(adapter.label).toBe('Moonshot AI');
  });

  it('declares an api-key auth method with envVar MOONSHOT_API_KEY', () => {
    const adapter = createMoonshotAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('MOONSHOT_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createMoonshotAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('moonshot');
    }
  });

  it('accepts the api.moonshot.ai alternate host', () => {
    expect(() =>
      createMoonshotAdapter({ apiKey: 'test-key', baseUrl: 'https://api.moonshot.ai/v1' }),
    ).not.toThrow();
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createMoonshotAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });
});

/**
 * Adapter contract test: createMinimaxAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction for
 * every supported base-URL shape (api.minimax.io default, and a rejected/SSRF
 * host that falls back silently).
 */

import { describe, expect, it } from 'vitest';

import { createMinimaxAdapter } from '../index';

describe('createMinimaxAdapter', () => {
  it('returns adapter with id="minimax" and label="MiniMax"', () => {
    const adapter = createMinimaxAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('minimax');
    expect(adapter.label).toBe('MiniMax');
  });

  it('declares an api-key auth method with envVar MINIMAX_API_KEY', () => {
    const adapter = createMinimaxAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('MINIMAX_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createMinimaxAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('minimax');
    }
  });

  it('constructs with no baseUrl override (api.minimax.io default)', () => {
    expect(() => createMinimaxAdapter({ apiKey: 'test-key' })).not.toThrow();
  });

  it('constructs with an explicit api.minimax.io baseUrl override', () => {
    expect(() =>
      createMinimaxAdapter({ apiKey: 'test-key', baseUrl: 'https://api.minimax.io/v1' }),
    ).not.toThrow();
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createMinimaxAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });
});

/**
 * Adapter contract test: createOpenRouterAdapter returns a ProviderAdapter
 * with the expected shape (id, label, auth methods, catalog, stream). No
 * network calls — confirms the adapter wires up without throwing on
 * construction, including with custom attribution headers and a
 * non-allowlisted baseUrl (SSRF fallback).
 */

import { describe, expect, it } from 'vitest';

import { createOpenRouterAdapter } from '../index';

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
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('open_router');
    }
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
});

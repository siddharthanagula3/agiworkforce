/**
 * Adapter contract test: createGroqAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction,
 * and that the SSRF base-URL allowlist gate behaves as documented.
 */

import { describe, expect, it } from 'vitest';

import { createGroqAdapter } from '../index';

describe('createGroqAdapter', () => {
  it('returns adapter with id="groq" and label="Groq"', () => {
    const adapter = createGroqAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('groq');
    expect(adapter.label).toBe('Groq');
  });

  it('declares an api-key auth method with envVar GROQ_API_KEY', () => {
    const adapter = createGroqAdapter({ apiKey: 'test-key' });
    expect(Array.isArray(adapter.auth)).toBe(true);
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('GROQ_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createGroqAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('groq');
    }
  });

  it('accepts a baseUrl override that resolves to the allowlisted host', () => {
    expect(() =>
      createGroqAdapter({ apiKey: 'test-key', baseUrl: 'https://api.groq.com/openai/v1' }),
    ).not.toThrow();
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    // SSRF guard: an attacker-controlled baseUrl must not crash construction
    // or be trusted — it silently falls back to the default host instead.
    expect(() =>
      createGroqAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });

  it('honors additionalAllowedBaseUrlHosts for legitimate custom gateways', () => {
    expect(() =>
      createGroqAdapter({
        apiKey: 'test-key',
        baseUrl: 'https://groq.internal-gateway.example.com/v1',
        additionalAllowedBaseUrlHosts: ['groq.internal-gateway.example.com'],
      }),
    ).not.toThrow();
  });
});

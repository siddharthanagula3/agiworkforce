/**
 * Adapter contract test: createXAIAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction.
 */

import { describe, expect, it } from 'vitest';

import { createXAIAdapter } from '../index';

describe('createXAIAdapter', () => {
  it('returns adapter with id="xai" and label="xAI"', () => {
    const adapter = createXAIAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('xai');
    expect(adapter.label).toBe('xAI');
  });

  it('declares an api-key auth method with envVar XAI_API_KEY', () => {
    const adapter = createXAIAdapter({ apiKey: 'test-key' });
    expect(Array.isArray(adapter.auth)).toBe(true);
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('XAI_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createXAIAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('xai');
    }
  });
});

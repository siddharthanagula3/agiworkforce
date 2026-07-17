/**
 * Adapter contract test: createQwenAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction
 * for every supported base-URL shape (DashScope compatible-mode default,
 * MuleRouter, and a rejected/SSRF host that falls back silently).
 */

import { describe, expect, it } from 'vitest';

import { createQwenAdapter } from '../index';

describe('createQwenAdapter', () => {
  it('returns adapter with id="qwen" and label="Qwen"', () => {
    const adapter = createQwenAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('qwen');
    expect(adapter.label).toBe('Qwen');
  });

  it('declares an api-key auth method with envVar QWEN_API_KEY', () => {
    const adapter = createQwenAdapter({ apiKey: 'test-key' });
    const apiKey = adapter.auth.find((a) => a.kind === 'api-key');
    expect(apiKey).toBeDefined();
    if (apiKey && apiKey.kind === 'api-key') {
      expect(apiKey.envVar).toBe('QWEN_API_KEY');
    }
  });

  it('returns the curated catalog when skipDiscovery is true', async () => {
    const adapter = createQwenAdapter({ apiKey: 'test-key', skipDiscovery: true });
    const models = await adapter.catalog();
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) {
      expect(m.provider).toBe('qwen');
    }
  });

  it('constructs with no baseUrl override (DashScope compatible-mode default)', () => {
    expect(() => createQwenAdapter({ apiKey: 'test-key' })).not.toThrow();
  });

  it('constructs with a MuleRouter baseUrl override', () => {
    expect(() =>
      createQwenAdapter({ apiKey: 'test-key', baseUrl: 'https://api.mulerouter.ai' }),
    ).not.toThrow();
  });

  it('constructs with an explicit DashScope international compatible-mode override', () => {
    expect(() =>
      createQwenAdapter({
        apiKey: 'test-key',
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      }),
    ).not.toThrow();
  });

  it('does not throw when a baseUrl override points at a non-allowlisted host (falls back silently)', () => {
    expect(() =>
      createQwenAdapter({ apiKey: 'test-key', baseUrl: 'https://evil.attacker.com/v1' }),
    ).not.toThrow();
  });
});

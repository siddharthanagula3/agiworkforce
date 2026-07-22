/**
 * Adapter contract test: createQwenAdapter returns a ProviderAdapter with
 * the expected shape (id, label, auth methods, catalog, stream). No network
 * calls — confirms the adapter wires up without throwing on construction
 * for every supported base-URL shape (DashScope compatible-mode default,
 * MuleRouter, and a rejected/SSRF host that falls back silently).
 */

import { describe, expect, it, vi } from 'vitest';

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

describe('createQwenAdapter fallbackEndpoints (DashScope → MuleRouter fail-over)', () => {
  function res503(): Response {
    return new Response(JSON.stringify({ error: { message: 'overloaded' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  function hostRecordingFetch(hosts: string[]) {
    return vi.fn(async (input: unknown) => {
      const url =
        typeof input === 'string' ? input : ((input as { url?: string })?.url ?? String(input));
      hosts.push(new URL(url).host);
      return res503();
    });
  }

  async function drain(adapter: ReturnType<typeof createQwenAdapter>) {
    const chunks: Array<{ type: string; reason?: string }> = [];
    for await (const chunk of adapter.stream(
      { model: 'qwen-3.7-plus', messages: [{ role: 'user', content: 'hi' }] } as never,
      new AbortController().signal,
    )) {
      chunks.push(chunk as { type: string; reason?: string });
    }
    return chunks;
  }

  it('rotates to the fallback endpoint when the primary fails pre-first-byte, then surfaces a terminal error', async () => {
    const hosts: string[] = [];
    const adapter = createQwenAdapter({
      apiKey: 'primary-key',
      fetch: hostRecordingFetch(hosts) as never,
      fallbackEndpoints: [{ baseUrl: 'https://api.mulerouter.ai', apiKey: 'sk-mr-fallback' }],
    });

    const chunks = await drain(adapter);

    // Both the primary (DashScope) and the fallback (MuleRouter) were attempted.
    expect(hosts.some((h) => h.includes('dashscope'))).toBe(true);
    expect(hosts.some((h) => h.includes('mulerouter'))).toBe(true);
    // Both exhausted → a terminal error is surfaced, never silent.
    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ type: 'stop', reason: 'error' });
  }, 20_000);

  it('drops a fallback endpoint that resolves to the same host as the primary (no self-retry)', async () => {
    const hosts: string[] = [];
    const adapter = createQwenAdapter({
      apiKey: 'primary-key',
      fetch: hostRecordingFetch(hosts) as never,
      // Same host as the DashScope compatible-mode default primary → filtered out.
      fallbackEndpoints: [{ baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }],
    });

    await drain(adapter);

    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.every((h) => h.includes('dashscope'))).toBe(true);
    expect(hosts.some((h) => h.includes('mulerouter'))).toBe(false);
  }, 20_000);
});

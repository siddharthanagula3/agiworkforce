import { describe, expect, it, vi } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';

import { QWEN_DEFAULT_BASE_URL } from '../base-url';
import { createQwenAdapter } from '../index';

const QWEN_DEFAULT_MODEL_ID = requireProviderDefaultModel('qwen');

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

  it('falls back to the default base URL for a host off the allowlist', () => {
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

describe('createQwenAdapter fallbackEndpoints (pre-first-byte fail-over)', () => {
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
      { model: QWEN_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'hi' }] } as never,
      new AbortController().signal,
    )) {
      chunks.push(chunk as { type: string; reason?: string });
    }
    return chunks;
  }

  it('rotates to the fallback endpoint when the primary fails pre-first-byte, then surfaces a terminal error', async () => {
    // Derived from the default rather than hardcoded, so flipping the default
    // region cannot turn this into a same-host fallback that is filtered out
    // and silently stops testing rotation.
    const primaryHost = new URL(QWEN_DEFAULT_BASE_URL).hostname;
    const otherRegion =
      primaryHost === 'dashscope-intl.aliyuncs.com'
        ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        : 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    const hosts: string[] = [];
    const adapter = createQwenAdapter({
      apiKey: 'primary-key',
      fetch: hostRecordingFetch(hosts) as never,
      fallbackEndpoints: [{ baseUrl: otherRegion, apiKey: 'alt-key' }],
    });

    const chunks = await drain(adapter);

    expect(hosts.some((h) => h === primaryHost)).toBe(true);
    expect(hosts.some((h) => h === new URL(otherRegion).hostname)).toBe(true);
    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ type: 'stop', reason: 'error' });
  }, 20_000);

  it('drops a fallback endpoint that resolves to the same host as the primary (no self-retry)', async () => {
    const hosts: string[] = [];
    const adapter = createQwenAdapter({
      apiKey: 'primary-key',
      fetch: hostRecordingFetch(hosts) as never,
      fallbackEndpoints: [{ baseUrl: QWEN_DEFAULT_BASE_URL }],
    });

    await drain(adapter);

    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.every((h) => h.includes('dashscope'))).toBe(true);
    expect(hosts.some((h) => h.includes('mulerouter'))).toBe(false);
  }, 20_000);
});

describe('createQwenAdapter Model Studio refusals', () => {
  function refusal(status: number, code: string, message: string): typeof fetch {
    return vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message, type: code, param: null, code }, request_id: 'r-1' }),
          {
            status,
            headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
          },
        ),
    ) as unknown as typeof fetch;
  }

  async function firstError(fetchImpl: typeof fetch) {
    const adapter = createQwenAdapter({ apiKey: 'fixture-key', fetch: fetchImpl as never });
    for await (const chunk of adapter.stream(
      { model: QWEN_DEFAULT_MODEL_ID, messages: [{ role: 'user', content: 'hi' }] } as never,
      new AbortController().signal,
    )) {
      if (chunk.type === 'error') return chunk;
    }
    throw new Error('The adapter finished without an error chunk');
  }

  it('reports a per-minute token throttle as a rate limit, not as an unfunded account', async () => {
    const chunk = await firstError(
      refusal(
        429,
        'insufficient_quota',
        'You exceeded your current quota, please check your plan and billing details.',
      ),
    );
    expect(chunk.classification?.category).toBe('rate_limit');
    expect(chunk.retryable).toBe(true);
  });

  it('reports a spent free tier as that model’s exhausted quota', async () => {
    const chunk = await firstError(
      refusal(
        403,
        'AllocationQuota.FreeTierOnly',
        'The free tier of the model has been exhausted.',
      ),
    );
    expect(chunk.classification).toMatchObject({
      category: 'quota_exhausted',
      providerHint: 'free_tier_only',
    });
  });

  it('reports a spent free allocation on a model without pay-as-you-go as exhausted quota', async () => {
    const chunk = await firstError(
      refusal(429, 'Throttling.AllocationQuota', 'Free allocated quota exceeded.'),
    );
    expect(chunk.classification).toMatchObject({
      category: 'quota_exhausted',
      providerHint: 'free_tier_only',
    });
    expect(chunk.retryable).toBe(false);
  });

  it.each([
    ['Endpoint.AccessDenied', 'Workspace endpoint access denied.'],
    ['AccessDenied', 'Access denied.'],
    ['access_denied', 'Access denied.'],
  ])(
    'reports a 403 %s as a refusal of that model, so the credential stays in service',
    async (code, message) => {
      const chunk = await firstError(refusal(403, code, message));
      expect(chunk.classification).toMatchObject({
        category: 'invalid_model',
        retryable: false,
        fallbackable: true,
      });
      expect(chunk.classification?.category).not.toBe('auth');
    },
  );
});

import { describe, expect, it } from 'vitest';

import type { ChatRequest, ModelInfo, StreamChunk } from '@agiworkforce/types';

import { createOpenAICompatAdapter, type OpenAICompatAdapterSpec } from '../compat-adapter';

const TEST_PROVIDER_ID = 'deepseek';
const TEST_BASE_URL = 'https://api.deepseek.com/v1';
const TEST_API_KEY = 'test-key';
const TEST_MODEL_ID = 'compat-test-model';

const TEST_CATALOG: readonly ModelInfo[] = [{ id: TEST_MODEL_ID, provider: TEST_PROVIDER_ID }];

function buildSpec(overrides: Partial<OpenAICompatAdapterSpec> = {}): OpenAICompatAdapterSpec {
  return {
    id: TEST_PROVIDER_ID,
    label: 'Compat Test',
    apiKeyEnvVar: 'COMPAT_TEST_API_KEY',
    apiKeyLabel: 'Compat Test API Key',
    baseUrlEnvVar: 'COMPAT_TEST_BASE_URL',
    defaultBaseUrl: TEST_BASE_URL,
    catalog: TEST_CATALOG,
    ...overrides,
  };
}

function buildRequest(): ChatRequest {
  return {
    model: TEST_MODEL_ID,
    messages: [{ role: 'user', content: 'ping' }],
  };
}

function sseResponse(events: readonly string[]): Response {
  const body = `${events.map((event) => `data: ${event}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function chunkEvent(delta: Record<string, unknown>): string {
  return JSON.stringify({
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 0,
    model: TEST_MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: null }],
  });
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) {
    out.push(chunk);
  }
  return out;
}

describe('createOpenAICompatAdapter · identity', () => {
  it('surfaces the spec identity and a required api-key auth method', () => {
    const adapter = createOpenAICompatAdapter(buildSpec(), { apiKey: TEST_API_KEY });

    expect(adapter.id).toBe(TEST_PROVIDER_ID);
    expect(adapter.label).toBe('Compat Test');
    expect(adapter.auth).toEqual([
      {
        kind: 'api-key',
        envVar: 'COMPAT_TEST_API_KEY',
        required: true,
        label: 'Compat Test API Key',
      },
    ]);
  });

  it('returns the curated catalog without a network call when discovery is skipped', async () => {
    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      skipDiscovery: true,
      fetch: () => {
        throw new Error('discovery must not reach the network');
      },
    });

    await expect(adapter.catalog()).resolves.toEqual([...TEST_CATALOG]);
  });

  it('requires an explicit baseUrl when the spec declares no default', () => {
    expect(() =>
      createOpenAICompatAdapter(buildSpec({ defaultBaseUrl: undefined }), { apiKey: TEST_API_KEY }),
    ).toThrow(/requires an explicit baseUrl/);
  });

  it('accepts a caller baseUrl in place of the missing default', () => {
    const adapter = createOpenAICompatAdapter(buildSpec({ defaultBaseUrl: undefined }), {
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
    });

    expect(adapter.id).toBe(TEST_PROVIDER_ID);
  });
});

describe('createOpenAICompatAdapter · request translation', () => {
  it('posts an OpenAI-shaped streaming body to the resolved base URL', async () => {
    let seenUrl: string | undefined;
    let seenAuth: string | null | undefined;
    let seenBody: Record<string, unknown> | undefined;

    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      fetch: async (input, init) => {
        seenUrl = String(input);
        seenAuth = new Headers(init?.headers).get('authorization');
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return sseResponse([chunkEvent({ content: 'pong' })]);
      },
    });

    await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(seenUrl).toBe(`${TEST_BASE_URL}/chat/completions`);
    expect(seenAuth).toBe(`Bearer ${TEST_API_KEY}`);
    expect(seenBody).toMatchObject({
      model: TEST_MODEL_ID,
      stream: true,
      messages: [{ role: 'user', content: 'ping' }],
    });
  });

  it('carries every extraBody field on the wire, the way a marketplace minimum discount travels', async () => {
    let seenBody: Record<string, unknown> | undefined;
    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      extraBody: { min_discount_percent: 30 },
      fetch: async (_input, init) => {
        seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return sseResponse([chunkEvent({ content: 'pong' })]);
      },
    });

    await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(seenBody).toMatchObject({ model: TEST_MODEL_ID, min_discount_percent: 30 });
  });

  it('routes through the caller baseUrl when one is supplied', async () => {
    const overrideBaseUrl = 'https://api.deepseek.com/v9';
    let seenUrl: string | undefined;

    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      baseUrl: overrideBaseUrl,
      fetch: async (input) => {
        seenUrl = String(input);
        return sseResponse([chunkEvent({ content: 'pong' })]);
      },
    });

    await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(seenUrl).toBe(`${overrideBaseUrl}/chat/completions`);
  });
});

describe('createOpenAICompatAdapter · stream translation', () => {
  it('maps content deltas to text-delta chunks', async () => {
    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      fetch: async () =>
        sseResponse([chunkEvent({ content: 'po' }), chunkEvent({ content: 'ng' })]),
    });

    const chunks = await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(chunks.filter((c) => c.type === 'text-delta')).toEqual([
      { type: 'text-delta', delta: 'po' },
      { type: 'text-delta', delta: 'ng' },
    ]);
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('maps reasoning_content deltas to thinking-delta chunks', async () => {
    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      fetch: async () => sseResponse([chunkEvent({ reasoning_content: 'because' })]),
    });

    const chunks = await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(chunks).toContainEqual({ type: 'thinking-delta', delta: 'because' });
  });
});

describe('createOpenAICompatAdapter · error classification', () => {
  const RETRY_AFTER_SECONDS = 1;
  const SDK_ATTEMPTS_PER_REQUEST = 3;

  it('classifies a 429 as retryable and carries Retry-After through', async () => {
    let attempts = 0;

    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      fetch: async () => {
        attempts += 1;
        return new Response(JSON.stringify({ error: { message: 'slow down' } }), {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': String(RETRY_AFTER_SECONDS),
          },
        });
      },
    });

    const chunks = await collect(adapter.stream(buildRequest(), new AbortController().signal));
    const error = chunks.find((c) => c.type === 'error');

    expect(error).toMatchObject({ type: 'error', code: '429', retryable: true });
    expect(error).toHaveProperty('retryAfterSeconds', RETRY_AFTER_SECONDS);
    expect(chunks.at(-1)).toEqual({ type: 'stop', reason: 'error' });
    // The openai SDK retries availability failures itself, so one logical
    // request can spend several upstream calls against a provider quota.
    expect(attempts).toBe(SDK_ATTEMPTS_PER_REQUEST);
  }, 20_000);

  it('classifies a 403 as non-retryable and still terminates the stream', async () => {
    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    });

    const chunks = await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(chunks.find((c) => c.type === 'error')).toMatchObject({
      type: 'error',
      code: '403',
      retryable: false,
    });
    expect(chunks.at(-1)).toEqual({ type: 'stop', reason: 'error' });
  });

  it('treats a 401 as retryable so a refreshable credential gets a second chance', async () => {
    const adapter = createOpenAICompatAdapter(buildSpec(), {
      apiKey: TEST_API_KEY,
      fetch: async () =>
        new Response(JSON.stringify({ error: { message: 'bad key' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    });

    const chunks = await collect(adapter.stream(buildRequest(), new AbortController().signal));

    expect(chunks.find((c) => c.type === 'error')).toMatchObject({
      type: 'error',
      code: '401',
      retryable: true,
    });
  });
});

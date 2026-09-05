import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idempotency-key'),
    deductCredits: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: vi.fn(() => 0) },
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));

import { buildStreamResponse, buildAdapterStreamResponse } from '../lib/stream-transform';
import {
  translateOpenAIStream,
  type OpenAIChatCompletionChunk,
} from '@agiworkforce/providers-openai';
import type { StreamChunk } from '@agiworkforce/types';
import type { ProcessedRequest } from '../lib/request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-parity-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true } as any,
    requestedModel: 'fixture-model',
    provider: 'openai',
    estimatedCostCents: 0,
    quotaWarningHeader: null,
    quotaFeature: 'standard' as any,
    isFlagshipRequest: false,
    usedFallback: false,
    resolvedTaskType: null,
    classifierConfidence: null,
    resolvedSlot: null,
    indicResult: { isIndic: false, dominantScript: null, indicRatio: 0 },
    originalModel: undefined,
    fallbackReason: undefined,
    ...overrides,
  } as ProcessedRequest;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

async function collectBody(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function dataLines(body: string): string[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .filter((line) => line !== 'data: [DONE]');
}

function rawOpenAISseStream(chunks: OpenAIChatCompletionChunk[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const chunk of chunks) {
    lines.push(`data: ${JSON.stringify(chunk)}`, '');
  }
  lines.push('data: [DONE]', '');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('\n')));
      controller.close();
    },
  });
}

async function* asChunks(
  chunks: OpenAIChatCompletionChunk[],
): AsyncIterable<OpenAIChatCompletionChunk> {
  for (const chunk of chunks) yield chunk;
}

const textFixture: OpenAIChatCompletionChunk[] = [
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        logprobs: null,
        finish_reason: null,
      },
    ],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: { content: 'Cats are ' }, logprobs: null, finish_reason: null }],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: { content: 'mammals.' }, logprobs: null, finish_reason: null }],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: 'stop' }],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  } as unknown as OpenAIChatCompletionChunk,
];

const toolCallFixture: OpenAIChatCompletionChunk[] = [
  {
    id: 'chatcmpl-real-openai-id-tool456',
    object: 'chat.completion.chunk',
    created: 1750000100,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        logprobs: null,
        finish_reason: null,
      },
    ],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-tool456',
    object: 'chat.completion.chunk',
    created: 1750000100,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call_abc',
              type: 'function',
              function: { name: 'get_weather', arguments: '' },
            },
          ],
        },
        logprobs: null,
        finish_reason: null,
      },
    ],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-tool456',
    object: 'chat.completion.chunk',
    created: 1750000100,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [
      {
        index: 0,
        delta: { tool_calls: [{ index: 0, function: { arguments: '{"city":"NYC"}' } }] },
        logprobs: null,
        finish_reason: null,
      },
    ],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-tool456',
    object: 'chat.completion.chunk',
    created: 1750000100,
    model: 'provider-upstream-model',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: 'tool_calls' }],
  } as unknown as OpenAIChatCompletionChunk,
];

describe('byte parity: legacy buildStreamResponse vs adapter buildAdapterStreamResponse (OpenAI, wireMode openai-passthrough)', () => {
  it('produces identical `data:` channel bytes for the tool-call scenario', async () => {
    const legacyResponse = await buildStreamResponse(
      makeRequest() as any,
      rawOpenAISseStream(toolCallFixture),
      makeProcessed(),
      'user-parity',
      'token-parity',
    );
    const legacyBody = await collectBody(legacyResponse as any);

    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(toolCallFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);

    expect(dataLines(legacyBody).length).toBe(4);
    expect(dataLines(adapterBody)).toEqual(dataLines(legacyBody));
  });

  it('produces identical `data:` channel bytes for the text-only scenario', async () => {
    const legacyResponse = await buildStreamResponse(
      makeRequest() as any,
      rawOpenAISseStream(textFixture),
      makeProcessed(),
      'user-parity',
      'token-parity',
    );
    const legacyBody = await collectBody(legacyResponse as any);

    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(textFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);

    expect(legacyBody.length).toBeGreaterThan(100);
    expect(dataLines(legacyBody).length).toBe(5);

    expect(dataLines(adapterBody)).toEqual(dataLines(legacyBody));
  });

  it('the role-announcement first chunk matches exactly (MUST-FIX #1)', async () => {
    const legacyResponse = await buildStreamResponse(
      makeRequest() as any,
      rawOpenAISseStream(textFixture),
      makeProcessed(),
      'user-parity',
      'token-parity',
    );
    const legacyBody = await collectBody(legacyResponse as any);
    const legacyFirstLine = dataLines(legacyBody)[0];
    expect(legacyFirstLine).toContain('"role":"assistant"');
    expect(legacyFirstLine).toContain('"content":""');

    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(textFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);
    expect(dataLines(adapterBody)[0]).toBe(legacyFirstLine);
  });

  it('the trailing usage-only chunk matches exactly (MUST-FIX #2)', async () => {
    const legacyResponse = await buildStreamResponse(
      makeRequest() as any,
      rawOpenAISseStream(textFixture),
      makeProcessed(),
      'user-parity',
      'token-parity',
    );
    const legacyBody = await collectBody(legacyResponse as any);
    const legacyLastLine = dataLines(legacyBody).at(-1);
    expect(legacyLastLine).toContain('"choices":[]');
    expect(legacyLastLine).toContain('"prompt_tokens":12');

    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(textFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);
    expect(dataLines(adapterBody).at(-1)).toBe(legacyLastLine);
  });

  it('real id/created/system_fingerprint/service_tier survive the round-trip (SHOULD-PRESERVE + BEST-EFFORT)', async () => {
    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(textFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);
    const firstLine = dataLines(adapterBody)[0] ?? '';
    expect(firstLine).toContain('"id":"chatcmpl-real-openai-id-abc123"');
    expect(firstLine).toContain('"created":1750000000');
    expect(firstLine).toContain('"system_fingerprint":"fp_real_openai_value"');
    expect(firstLine).toContain('"service_tier":"default"');
  });

  it('real per-chunk logprobs survive the round-trip when the request set logprobs:true (full passthrough, not a static null)', async () => {
    const realLogprobs = {
      content: [{ token: 'Cats', logprob: -0.1, bytes: [67, 97, 116, 115], top_logprobs: [] }],
    };
    const logprobsFixture: OpenAIChatCompletionChunk[] = [
      {
        id: 'chatcmpl-logprobs-test',
        object: 'chat.completion.chunk',
        created: 1750000300,
        model: 'provider-upstream-model',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: '' },
            logprobs: null,
            finish_reason: null,
          },
        ],
      } as unknown as OpenAIChatCompletionChunk,
      {
        id: 'chatcmpl-logprobs-test',
        object: 'chat.completion.chunk',
        created: 1750000300,
        model: 'provider-upstream-model',
        choices: [
          {
            index: 0,
            delta: { content: 'Cats' },
            logprobs: realLogprobs,
            finish_reason: null,
          },
        ],
      } as unknown as OpenAIChatCompletionChunk,
      {
        id: 'chatcmpl-logprobs-test',
        object: 'chat.completion.chunk',
        created: 1750000300,
        model: 'provider-upstream-model',
        choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: 'stop' }],
      } as unknown as OpenAIChatCompletionChunk,
    ];

    const legacyResponse = await buildStreamResponse(
      makeRequest() as any,
      rawOpenAISseStream(logprobsFixture),
      makeProcessed(),
      'user-parity',
      'token-parity',
    );
    const legacyBody = await collectBody(legacyResponse as any);
    const legacyContentLine = dataLines(legacyBody).find((l) => l.includes('"content":"Cats"'));
    expect(legacyContentLine).toContain('"logprobs":{"content":[{"token":"Cats"');

    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(logprobsFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);
    const adapterContentLine = dataLines(adapterBody).find((l) => l.includes('"content":"Cats"'));
    expect(adapterContentLine).toBe(legacyContentLine);
  });

  it('falls back to a synthesized id/created when the producer supplies none (compat providers)', async () => {
    async function* chunksWithoutMeta(): AsyncIterable<StreamChunk> {
      yield { type: 'text-delta', delta: 'hi' };
      yield { type: 'stop', reason: 'end_turn' };
    }
    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksWithoutMeta(),
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);
    const firstLine = dataLines(adapterBody)[0] ?? '';
    expect(firstLine).toContain('"id":"chatcmpl-');
    expect(firstLine).not.toContain('undefined');
    expect(firstLine).not.toContain('"system_fingerprint"');
    expect(firstLine).not.toContain('"service_tier"');
  });

  it('[DONE] is emitted exactly once, even though OpenAI real Chat Completions SSE already contains its own', async () => {
    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateOpenAIStream(asChunks(textFixture)) as AsyncIterable<StreamChunk>,
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
      'openai-passthrough',
    );
    const adapterBody = await collectBody(adapterResponse as any);
    const doneCount = adapterBody.split('data: [DONE]').length - 1;
    expect(doneCount).toBe(1);
  });
});

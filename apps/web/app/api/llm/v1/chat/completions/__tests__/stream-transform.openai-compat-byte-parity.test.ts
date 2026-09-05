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

function makeProcessed(provider: string, model: string): ProcessedRequest {
  return {
    requestId: 'req-compat-parity-001',
    chatRequest: { model, messages: [], stream: true } as any,
    requestedModel: model,
    provider,
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
  } as unknown as ProcessedRequest;
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

function rawSseStream(chunks: OpenAIChatCompletionChunk[]): ReadableStream<Uint8Array> {
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

function fixtureFor(model: string): OpenAIChatCompletionChunk[] {
  return [
    {
      id: 'chatcmpl-real-id-xyz',
      object: 'chat.completion.chunk',
      created: 1750000200,
      model,
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
      id: 'chatcmpl-real-id-xyz',
      object: 'chat.completion.chunk',
      created: 1750000200,
      model,
      choices: [
        { index: 0, delta: { content: 'Hello there.' }, logprobs: null, finish_reason: null },
      ],
    } as unknown as OpenAIChatCompletionChunk,
    {
      id: 'chatcmpl-real-id-xyz',
      object: 'chat.completion.chunk',
      created: 1750000200,
      model,
      choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: 'stop' }],
    } as unknown as OpenAIChatCompletionChunk,
  ];
}

const COMPAT_PROVIDERS: Array<{ provider: string; model: string }> = [
  { provider: 'minimax', model: 'fixture-model' },
  { provider: 'moonshot', model: 'fixture-model' },
  { provider: 'zhipu', model: 'fixture-model' },
  { provider: 'qwen', model: 'fixture-model' },
  { provider: 'openrouter', model: 'fixture-model' },
  { provider: 'deepseek', model: 'fixture-model' },
  { provider: 'xai', model: 'fixture-model' },
  { provider: 'perplexity', model: 'fixture-model' },
];

describe.each(COMPAT_PROVIDERS)(
  'byte parity: legacy buildStreamResponse vs adapter buildAdapterStreamResponse ($provider, wireMode openai-passthrough)',
  ({ provider, model }) => {
    it(`produces identical data: channel bytes for ${provider}`, async () => {
      const fixture = fixtureFor(model);

      const legacyResponse = await buildStreamResponse(
        makeRequest() as any,
        rawSseStream(fixture),
        makeProcessed(provider, model),
        'user-parity',
        'token-parity',
      );
      const legacyBody = await collectBody(legacyResponse as any);

      const adapterResponse = await buildAdapterStreamResponse(
        makeRequest() as any,
        translateOpenAIStream(asChunks(fixture)) as AsyncIterable<StreamChunk>,
        makeProcessed(provider, model),
        'user-parity',
        'token-parity',
        Date.now(),
        'openai-passthrough',
      );
      const adapterBody = await collectBody(adapterResponse as any);

      expect(dataLines(legacyBody).length).toBe(3);
      expect(dataLines(adapterBody)).toEqual(dataLines(legacyBody));
    });
  },
);

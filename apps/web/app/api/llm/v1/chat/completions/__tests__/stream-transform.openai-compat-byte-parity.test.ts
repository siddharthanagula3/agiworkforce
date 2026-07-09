/**
 * Byte-parity for the 9 openai-compat providers (task #34's compat batch),
 * riding on the SAME `wireMode: 'openai-passthrough'` machinery proven for
 * OpenAI itself in stream-transform.openai-byte-parity.test.ts.
 *
 * Confirmed before writing this file, not assumed: every one of the 9
 * legacy provider files (apps/web/lib/llm-providers/{groq,mistral,moonshot,
 * zhipu,qwen,openrouter,deepseek,xai,perplexity}.ts) does `return
 * response.body` in `streamRequest()` with ZERO internal reshaping --
 * identical to `openai.ts`'s own pattern, which is what makes
 * `wireMode: 'openai-passthrough'` the correct mode for all 10 (not just
 * OpenAI). Each `packages/providers/{provider}` package is a thin config
 * wrapper around `@agiworkforce/providers-openai`'s translate/stream layer
 * (see adapter-factory.ts's `buildCompatAdapter` docstring), so this suite
 * verifies the SHARED wire-shape machinery serves every provider string
 * correctly (per-provider `model` rewrite, per-provider billing/TTFT
 * plumbing in `buildAdapterStreamResponse`) -- it does not re-derive the
 * MUST-FIX/SHOULD-PRESERVE/BEST-EFFORT wire-shape proof per provider (that
 * proof is provider-independent, already established for OpenAI, and these
 * providers share the exact same `translateOpenAIStream`/`OpenAIWireAssembler`
 * code path). Package-internal quirks (moonshot's flat->nested cache-usage
 * rewrite, openrouter's Anthropic cache_control injection, qwen's base-url
 * selection) are each package's OWN concern, verified by their own
 * package-level tests built when these packages were created -- out of
 * scope here, which is about ROUTE-LEVEL wiring, not re-auditing packages
 * this migration didn't touch.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/assert-quota', () => ({
  reconcileUsage: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idempotency-key'),
    deductCredits: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: vi.fn(() => 0) },
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
  { provider: 'groq', model: 'groq-llama-3.3-70b' },
  { provider: 'mistral', model: 'mistral-large' },
  { provider: 'moonshot', model: 'moonshot-v1-8k' },
  { provider: 'zhipu', model: 'glm-4.6' },
  { provider: 'qwen', model: 'qwen-max' },
  { provider: 'openrouter', model: 'openrouter-auto' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'xai', model: 'grok-4' },
  { provider: 'perplexity', model: 'sonar' },
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

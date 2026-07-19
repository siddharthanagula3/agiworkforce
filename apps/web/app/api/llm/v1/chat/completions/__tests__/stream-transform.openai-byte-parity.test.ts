/**
 * OpenAI byte-parity pass (task #34's OpenAI slice, team-lead RULING:
 * Option B -- preserve fidelity, scoped by value).
 *
 * Unlike Anthropic/Google, OpenAI's legacy path (apps/web/lib/llm-providers/
 * openai.ts's `streamRequest`) does ZERO internal reshaping: it returns
 * `response.body` untouched, and `buildStreamResponse` (stream-transform.ts)
 * only rewrites the top-level `model` field for any non-Anthropic provider
 * (confirmed by reading both files directly) -- so the legacy wire is
 * near-verbatim real OpenAI Chat Completions SSE: full `{id, object,
 * created, model, system_fingerprint, service_tier, choices}` envelope, a
 * `role:"assistant"` announcement as the first chunk, `logprobs: null` on
 * every choice, and a trailing usage-only chunk (`choices: []`, `usage`).
 *
 * The canonical adapter path (`translateOpenAIStream` -> `StreamChunk` ->
 * `OpenAIWireAssembler`) round-trips through a narrower representation that
 * can't carry these by default. `OpenAIWireAssembler`'s `wireMode:
 * 'openai-passthrough'` (added for this ruling) closes the gap:
 *   - MUST-FIX (real regressions, reconstructed exactly): the role-
 *     announcement first chunk, and the trailing usage-only chunk.
 *   - SHOULD-PRESERVE (additive passthrough via `StreamChunkResponseMeta`,
 *     packages/ai/providers/openai/src/stream.ts's `translateOpenAIStream`):
 *     real `id`/`created`.
 *   - BEST-EFFORT (cheap, included): `system_fingerprint`, `service_tier`
 *     (via the same `StreamChunkResponseMeta`), and a static `logprobs:
 *     null` (real OpenAI always returns this when the caller never requests
 *     `logprobs: true`, which `translateChatRequest` never does -- a
 *     constant, not per-token data threaded through the pipeline).
 *
 * This suite drives the REAL route functions (`buildStreamResponse`,
 * `buildAdapterStreamResponse` with `wireMode: 'openai-passthrough'`) for
 * the SAME fixture, matching stream-transform.byte-parity.test.ts's
 * (Anthropic) and stream-transform.google-byte-parity.test.ts's rigor, and
 * asserts actual byte parity -- not divergence documentation.
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

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-parity-001',
    chatRequest: { model: 'gpt-5.5', messages: [], stream: true } as any,
    requestedModel: 'gpt-5.5',
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

/** Raw upstream ReadableStream matching what openai.ts's streamRequest
 *  forwards -- fetch's raw response.body, UNMODIFIED (see lib/llm-providers/
 *  openai.ts: `return response.body;`, zero reshaping). */
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

/** Realistic real-OpenAI-shaped fixture: role-bearing first delta,
 *  system_fingerprint/service_tier (present on every chunk, matching real
 *  OpenAI's own behavior of repeating stable per-stream metadata) and
 *  logprobs (fields the raw SSE carries), text deltas, a finish chunk, and
 *  a trailing usage-only chunk with `choices: []` (real OpenAI's actual
 *  `stream_options.include_usage` shape -- the usage-only chunk arrives on
 *  its OWN, separate, finish_reason-less chunk, after the finish chunk). */
const textFixture: OpenAIChatCompletionChunk[] = [
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'gpt-5.5-2026-01-01',
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
    model: 'gpt-5.5-2026-01-01',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: { content: 'Cats are ' }, logprobs: null, finish_reason: null }],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'gpt-5.5-2026-01-01',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: { content: 'mammals.' }, logprobs: null, finish_reason: null }],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'gpt-5.5-2026-01-01',
    system_fingerprint: 'fp_real_openai_value',
    service_tier: 'default',
    choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: 'stop' }],
  } as unknown as OpenAIChatCompletionChunk,
  {
    id: 'chatcmpl-real-openai-id-abc123',
    object: 'chat.completion.chunk',
    created: 1750000000,
    model: 'gpt-5.5-2026-01-01',
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

/** Tool-call fixture -- a structurally different delta shape (`tool_calls`
 *  instead of `content`) than the text fixture, verified separately since
 *  `chunkEnvelope`'s openai-passthrough branch is generic over `delta` but
 *  worth confirming end-to-end rather than assumed from the text case alone. */
const toolCallFixture: OpenAIChatCompletionChunk[] = [
  {
    id: 'chatcmpl-real-openai-id-tool456',
    object: 'chat.completion.chunk',
    created: 1750000100,
    model: 'gpt-5.5-2026-01-01',
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
    model: 'gpt-5.5-2026-01-01',
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
    model: 'gpt-5.5-2026-01-01',
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
    model: 'gpt-5.5-2026-01-01',
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

    // Sanity: prove the comparison is non-trivial.
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
    // Unlike id/created/system_fingerprint/service_tier (stream-stable,
    // captured once), logprobs varies PER CHUNK -- OpenAI reports different
    // token-level data on every chunk. translateChatRequest never sets
    // logprobs:true today, so every OTHER fixture in this file legitimately
    // has logprobs:null throughout; this fixture proves the plumbing
    // reproduces a REAL non-null value too, not just "null stays null."
    const realLogprobs = {
      content: [{ token: 'Cats', logprob: -0.1, bytes: [67, 97, 116, 115], top_logprobs: [] }],
    };
    const logprobsFixture: OpenAIChatCompletionChunk[] = [
      {
        id: 'chatcmpl-logprobs-test',
        object: 'chat.completion.chunk',
        created: 1750000300,
        model: 'gpt-5.5-2026-01-01',
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
        model: 'gpt-5.5-2026-01-01',
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
        model: 'gpt-5.5-2026-01-01',
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
    // No StreamChunkResponseMeta at all -- simulates a provider whose stream
    // never carries a stable id/created (or a future compat vendor whose
    // wire doesn't). openai-passthrough must not crash or emit "undefined".
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
    // The official openai SDK (createOpenAIAdapter uses sdk.chat.completions.create())
    // parses [DONE] internally and ends the async iterable -- it never
    // surfaces as a yielded chunk for translateOpenAIStream to see or
    // re-emit, so there is no double-up risk on the input side; this
    // confirms there's exactly one on the output side too.
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

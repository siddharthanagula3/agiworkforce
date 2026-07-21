/**
 * Golden fixtures for buildStreamResponse's CURRENT wire output.
 *
 * Wave 2 step 5 (migrate off lib/llm-providers onto packages/ai/providers
 * adapters) must keep the public SSE contract byte-stable. This suite
 * pins down exactly what today's implementation emits for representative
 * upstream event sequences -- Anthropic-native raw SSE (which stream-
 * transform.ts reshapes into OpenAI-compatible chunks, including the
 * x_tool_status/x_search_results/x_code_result server-tool extensions and
 * <thinking>/</thinking> content wrapping) and an OpenAI-shape passthrough
 * stream (which today's code barely touches beyond usage extraction and
 * rewriting `model`) -- so the eventual adapter-based rewrite has an
 * executable spec to match, not just a prose claim.
 *
 * Assertions were captured FROM the real implementation (run once, actual
 * output promoted into the expectation), not predicted from reading the
 * source -- that's the point of a golden fixture.
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

import { buildStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-test-001',
    chatRequest: { model: 'claude-opus-4-8', messages: [], stream: true } as any,
    requestedModel: 'claude-opus-4-8',
    provider: 'anthropic',
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

/** Build a raw upstream ReadableStream from literal SSE lines (caller
 *  supplies "event: x" / "data: {...}" framing verbatim, matching what
 *  anthropic.ts's streamRequest forwards -- it returns fetch's raw
 *  response.body unmodified, see lib/llm-providers/anthropic.ts:477). */
function rawSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = lines.join('\n') + '\n\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Collect the full decoded SSE body text. */
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

/** Split a collected SSE body into its `data: ...` payload lines (decoded
 *  JSON where possible, raw string for [DONE] / non-JSON passthrough
 *  lines), dropping blank lines. Mirrors how a real SSE client parses the
 *  wire, and keeps assertions readable (structured objects, not a giant
 *  raw-text blob). */
function parseDataLines(body: string): unknown[] {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => {
      const payload = line.slice('data: '.length).trim();
      if (payload === '[DONE]') return '[DONE]';
      return JSON.parse(payload);
    });
}

describe('buildStreamResponse golden fixture · Anthropic-native raw SSE', () => {
  it('reshapes text, server-managed web_search, thinking, and tool_use into the current OpenAI-compatible wire', async () => {
    const upstream = rawSseStream([
      'event: message_start',
      'data: ' +
        JSON.stringify({
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 500,
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 400,
              cache_creation: { ephemeral_1h_input_tokens: 300 },
            },
          },
        }),
      '',
      'event: content_block_start',
      'data: ' +
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Let me search. ' },
        }),
      '',
      'event: content_block_stop',
      'data: ' + JSON.stringify({ type: 'content_block_stop', index: 0 }),
      '',
      'event: content_block_start',
      'data: ' +
        JSON.stringify({
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'server_tool_use', id: 'srvtool_1', name: 'web_search' },
        }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"query":"cats"}' },
        }),
      '',
      'event: content_block_stop',
      'data: ' + JSON.stringify({ type: 'content_block_stop', index: 1 }),
      '',
      'event: content_block_start',
      'data: ' +
        JSON.stringify({
          type: 'content_block_start',
          index: 2,
          content_block: {
            type: 'web_search_tool_result',
            content: [{ url: 'https://example.com' }],
          },
        }),
      '',
      'event: content_block_stop',
      'data: ' + JSON.stringify({ type: 'content_block_stop', index: 2 }),
      '',
      'event: content_block_start',
      'data: ' +
        JSON.stringify({
          type: 'content_block_start',
          index: 3,
          content_block: { type: 'thinking' },
        }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 3,
          delta: { type: 'thinking_delta', thinking: 'pondering...' },
        }),
      '',
      'event: content_block_stop',
      'data: ' + JSON.stringify({ type: 'content_block_stop', index: 3 }),
      '',
      'event: content_block_start',
      'data: ' +
        JSON.stringify({
          type: 'content_block_start',
          index: 4,
          content_block: { type: 'tool_use', id: 'call_abc', name: 'get_weather' },
        }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 4,
          delta: { type: 'input_json_delta', partial_json: '{"city":"NYC"}' },
        }),
      '',
      'event: content_block_stop',
      'data: ' + JSON.stringify({ type: 'content_block_stop', index: 4 }),
      '',
      'event: message_delta',
      'data: ' +
        JSON.stringify({
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 42 },
        }),
      '',
      'event: message_stop',
      'data: ' + JSON.stringify({ type: 'message_stop' }),
    ]);

    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed(),
      'user-001',
      'token-001',
    );

    const body = await collectBody(response as any);
    const events = parseDataLines(body);

    expect(events).toEqual([
      { choices: [{ delta: { content: 'Let me search. ' }, index: 0 }], model: 'claude-opus-4-8' },
      {
        choices: [
          {
            delta: {
              x_tool_status: { type: 'server_tool_use', name: 'web_search', status: 'searching' },
            },
            index: 0,
          },
        ],
        model: 'claude-opus-4-8',
      },
      {
        choices: [
          {
            delta: {
              x_search_results: {
                type: 'web_search_tool_result',
                content: [{ url: 'https://example.com' }],
              },
            },
            index: 0,
          },
        ],
        model: 'claude-opus-4-8',
      },
      { choices: [{ delta: { content: '<thinking>' }, index: 0 }], model: 'claude-opus-4-8' },
      { choices: [{ delta: { content: 'pondering...' }, index: 0 }], model: 'claude-opus-4-8' },
      { choices: [{ delta: { content: '</thinking>' }, index: 0 }], model: 'claude-opus-4-8' },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 4,
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '' },
                },
              ],
            },
            index: 0,
          },
        ],
        model: 'claude-opus-4-8',
      },
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 4, function: { arguments: '{"city":"NYC"}' } }] },
            index: 0,
          },
        ],
        model: 'claude-opus-4-8',
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }],
        model: 'claude-opus-4-8',
      },
      '[DONE]',
    ]);
  });

  it('passes non-"data:" SSE lines (the "event: ..." framing) through verbatim', async () => {
    const upstream = rawSseStream([
      'event: content_block_start',
      'data: ' +
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        }),
    ]);

    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed(),
      'user-002',
      'token-002',
    );

    const body = await collectBody(response as any);
    expect(body).toContain('event: content_block_start');
    expect(body).toContain('event: content_block_delta');
  });

  it('documents current (unhandled) behavior for citations_delta content_block_delta events', async () => {
    const upstream = rawSseStream([
      'event: content_block_start',
      'data: ' +
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'citations_delta',
            citation: {
              type: 'web_search_result_location',
              cited_text: 'cats',
              url: 'https://example.com',
            },
          },
        }),
      '',
      'event: content_block_delta',
      'data: ' +
        JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: ' are mammals' },
        }),
    ]);

    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed(),
      'user-002b',
      'token-002b',
    );

    const body = await collectBody(response as any);
    const events = parseDataLines(body);
    // No case in stream-transform.ts's Anthropic branch matches
    // `delta.type === 'citations_delta'`, so `transformedEvent` stays the
    // untouched original -- the RAW Anthropic-shaped event (no `choices`
    // wrapper, no rewritten `model`) is serialized straight onto the wire.
    // This is almost certainly an accidental gap rather than a deliberate
    // feature, but the OpenAI-search-results lesson from this same
    // migration was "accidental-looking behavior still needs verified
    // evidence before it can change" -- so the canonical-adapter rewrite
    // must reproduce this exact passthrough, not "clean it up", until
    // team-lead confirms whether any client parses it.
    expect(events).toEqual([
      {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'citations_delta',
          citation: {
            type: 'web_search_result_location',
            cited_text: 'cats',
            url: 'https://example.com',
          },
        },
      },
      {
        choices: [{ delta: { content: ' are mammals' }, index: 0 }],
        model: 'claude-opus-4-8',
      },
    ]);
  });
});

describe('buildStreamResponse golden fixture · OpenAI-shape passthrough', () => {
  it('passes OpenAI-compatible chunks through unchanged except rewriting `model`', async () => {
    const upstream = rawSseStream([
      'data: ' +
        JSON.stringify({
          choices: [{ delta: { content: 'Hello' }, index: 0 }],
          model: 'gpt-5.6-sol-upstream-id',
        }),
      '',
      'data: ' +
        JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
          model: 'gpt-5.6-sol-upstream-id',
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      '',
      'data: [DONE]',
    ]);

    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed({
        provider: 'openai',
        requestedModel: 'gpt-5.6-sol',
        chatRequest: { model: 'gpt-5.6-sol', messages: [], stream: true } as any,
      }),
      'user-003',
      'token-003',
    );

    const body = await collectBody(response as any);
    const events = parseDataLines(body);

    expect(events).toEqual([
      { choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'gpt-5.6-sol' },
      {
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'gpt-5.6-sol',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      '[DONE]',
    ]);
  });
});

describe('buildStreamResponse golden fixture · response headers', () => {
  it('sets the SSE content-type and cache-control headers', async () => {
    const upstream = rawSseStream(['data: [DONE]']);
    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed(),
      'user-004',
      'token-004',
    );
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });
});

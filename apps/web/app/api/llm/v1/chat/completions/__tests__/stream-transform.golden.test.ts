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

import { buildStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-test-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true } as any,
    requestedModel: 'fixture-model',
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
      { choices: [{ delta: { content: 'Let me search. ' }, index: 0 }], model: 'fixture-model' },
      {
        choices: [
          {
            delta: {
              x_tool_status: {
                type: 'server_tool_use',
                name: 'web_search',
                status: 'searching',
                tool_use_id: 'srvtool_1',
                status_phrase: 'Searching the web',
              },
            },
            index: 0,
          },
        ],
        model: 'fixture-model',
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
        model: 'fixture-model',
      },
      { choices: [{ delta: { content: '<thinking>' }, index: 0 }], model: 'fixture-model' },
      { choices: [{ delta: { content: 'pondering...' }, index: 0 }], model: 'fixture-model' },
      { choices: [{ delta: { content: '</thinking>' }, index: 0 }], model: 'fixture-model' },
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
        model: 'fixture-model',
      },
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 4, function: { arguments: '{"city":"NYC"}' } }] },
            index: 0,
          },
        ],
        model: 'fixture-model',
      },
      {
        choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }],
        model: 'fixture-model',
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
        model: 'fixture-model',
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
          model: 'provider-upstream-model',
        }),
      '',
      'data: ' +
        JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
          model: 'provider-upstream-model',
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
        requestedModel: 'fixture-openai-model',
        chatRequest: { model: 'fixture-openai-model', messages: [], stream: true } as any,
      }),
      'user-003',
      'token-003',
    );

    const body = await collectBody(response as any);
    const events = parseDataLines(body);

    expect(events).toEqual([
      { choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'fixture-openai-model' },
      {
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'fixture-openai-model',
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

  it('carries the secret redaction count when the prompt was redacted', async () => {
    const upstream = rawSseStream(['data: [DONE]']);
    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed({ secretRedactionCount: 3 }),
      'user-005',
      'token-005',
    );
    expect(response.headers.get('X-AGI-Secret-Redaction-Count')).toBe('3');
  });

  it('omits the secret redaction header when nothing was redacted', async () => {
    const upstream = rawSseStream(['data: [DONE]']);
    const response = await buildStreamResponse(
      makeRequest() as any,
      upstream,
      makeProcessed(),
      'user-006',
      'token-006',
    );
    expect(response.headers.has('X-AGI-Secret-Redaction-Count')).toBe(false);
  });
});

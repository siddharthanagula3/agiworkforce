
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

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
import { translateAnthropicStream } from '@agiworkforce/providers-anthropic';
import type { ProcessedRequest } from '../lib/request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-parity-001',
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

function stripToDataLines(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .join('\n');
}

async function* asAnthropicEvents(events: unknown[]): AsyncIterable<Anthropic.MessageStreamEvent> {
  for (const event of events) yield event as Anthropic.MessageStreamEvent;
}

function rawSseStream(
  events: Array<{ eventName: string; data: unknown }>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const { eventName, data } of events) {
    lines.push(`event: ${eventName}`, `data: ${JSON.stringify(data)}`, '');
  }
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('\n')));
      controller.close();
    },
  });
}

const richEvents: Array<{ eventName: string; data: unknown }> = [
  {
    eventName: 'message_start',
    data: {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: 500,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 400,
          cache_creation: { ephemeral_1h_input_tokens: 300 },
        },
      },
    },
  },
  {
    eventName: 'content_block_start',
    data: { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  },
  {
    eventName: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Let me search. ' },
    },
  },
  { eventName: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
  {
    eventName: 'content_block_start',
    data: {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'server_tool_use', id: 'srvtool_1', name: 'web_search' },
    },
  },
  {
    eventName: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"query":"cats"}' },
    },
  },
  { eventName: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
  {
    eventName: 'content_block_start',
    data: {
      type: 'content_block_start',
      index: 2,
      content_block: {
        type: 'web_search_tool_result',
        content: [{ url: 'https://example.com' }],
      },
    },
  },
  { eventName: 'content_block_stop', data: { type: 'content_block_stop', index: 2 } },
  {
    eventName: 'content_block_start',
    data: { type: 'content_block_start', index: 3, content_block: { type: 'thinking' } },
  },
  {
    eventName: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 3,
      delta: { type: 'thinking_delta', thinking: 'pondering...' },
    },
  },
  { eventName: 'content_block_stop', data: { type: 'content_block_stop', index: 3 } },
  {
    eventName: 'content_block_start',
    data: {
      type: 'content_block_start',
      index: 4,
      content_block: { type: 'tool_use', id: 'call_abc', name: 'get_weather' },
    },
  },
  {
    eventName: 'content_block_delta',
    data: {
      type: 'content_block_delta',
      index: 4,
      delta: { type: 'input_json_delta', partial_json: '{"city":"NYC"}' },
    },
  },
  { eventName: 'content_block_stop', data: { type: 'content_block_stop', index: 4 } },
  {
    eventName: 'message_delta',
    data: {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 42 },
    },
  },
  { eventName: 'message_stop', data: { type: 'message_stop' } },
];

describe('byte parity: legacy buildStreamResponse vs adapter buildAdapterStreamResponse', () => {
  it('produce identical `data:` channel bytes for the rich text/web_search/thinking/tool_use scenario', async () => {
    const legacyResponse = await buildStreamResponse(
      makeRequest() as any,
      rawSseStream(richEvents),
      makeProcessed(),
      'user-parity',
      'token-parity',
    );
    const legacyBody = await collectBody(legacyResponse as any);

    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateAnthropicStream(asAnthropicEvents(richEvents.map((e) => e.data))),
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
    );
    const adapterBody = await collectBody(adapterResponse as any);

    expect(legacyBody.length).toBeGreaterThan(100);

    expect(stripToDataLines(adapterBody)).toBe(stripToDataLines(legacyBody));
  });
});

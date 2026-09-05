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

import { buildAdapterStreamResponse } from '../lib/stream-transform';
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

const richEvents: unknown[] = [
  {
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
  { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Let me search. ' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'server_tool_use', id: 'srvtool_1', name: 'web_search' },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"query":"cats"}' },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: {
      type: 'web_search_tool_result',
      content: [{ url: 'https://example.com' }],
    },
  },
  { type: 'content_block_stop', index: 2 },
  { type: 'content_block_start', index: 3, content_block: { type: 'thinking' } },
  {
    type: 'content_block_delta',
    index: 3,
    delta: { type: 'thinking_delta', thinking: 'pondering...' },
  },
  { type: 'content_block_stop', index: 3 },
  {
    type: 'content_block_start',
    index: 4,
    content_block: { type: 'tool_use', id: 'call_abc', name: 'get_weather' },
  },
  {
    type: 'content_block_delta',
    index: 4,
    delta: { type: 'input_json_delta', partial_json: '{"city":"NYC"}' },
  },
  { type: 'content_block_stop', index: 4 },
  {
    type: 'content_block_start',
    index: 5,
    content_block: { type: 'server_tool_use', id: 'wf_1', name: 'web_fetch' },
  },
  { type: 'content_block_stop', index: 5 },
  {
    type: 'content_block_start',
    index: 6,
    content_block: {
      type: 'web_fetch_tool_result',
      tool_use_id: 'wf_1',
      content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' },
    },
  },
  { type: 'content_block_stop', index: 6 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'tool_use' },
    usage: { output_tokens: 42 },
  },
  { type: 'message_stop' },
];

const RICH_SCENARIO_GOLDEN_DATA_LINES = [
  'data: {"choices":[{"delta":{"content":"Let me search. "},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"x_tool_status":{"type":"server_tool_use","name":"web_search","status":"searching","tool_use_id":"srvtool_1","status_phrase":"Searching the web"}},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"x_search_results":{"type":"web_search_tool_result","content":[{"url":"https://example.com"}]}},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"content":"<thinking>"},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"content":"pondering..."},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"content":"</thinking>"},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":4,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":4,"function":{"arguments":"{\\"city\\":\\"NYC\\"}"}}]},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"x_tool_status":{"type":"server_tool_use","name":"web_fetch","status":"fetching","tool_use_id":"wf_1","status_phrase":"Fetching page"}},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{"x_tool_result":{"tool_call_id":"wf_1","name":"web_fetch","content":"Web fetch failed: url_not_accessible","is_error":true}},"index":0}],"model":"fixture-model"}',
  'data: {"choices":[{"delta":{},"index":0}],"model":"fixture-model","usage":{"prompt_tokens":500,"completion_tokens":42,"total_tokens":542,"prompt_tokens_details":{"cached_tokens":100}}}',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls","index":0}],"model":"fixture-model"}',
  'data: [DONE]',
].join('\n');

describe('buildAdapterStreamResponse, rich text/web_search/thinking/tool_use golden wire', () => {
  it('emits the exact `data:` channel bytes for the scenario', async () => {
    const adapterResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      translateAnthropicStream(asAnthropicEvents(richEvents)),
      makeProcessed(),
      'user-parity',
      'token-parity',
      Date.now(),
    );
    const adapterBody = await collectBody(adapterResponse as any);

    expect(stripToDataLines(adapterBody)).toBe(RICH_SCENARIO_GOLDEN_DATA_LINES);
  });
});

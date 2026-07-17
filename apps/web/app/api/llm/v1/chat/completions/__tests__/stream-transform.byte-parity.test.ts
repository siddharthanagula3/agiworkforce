/**
 * Byte parity between the legacy `buildStreamResponse` (unmodified,
 * apps/web/lib/llm-providers raw-fetch passthrough + reshape) and the new
 * adapter-path `buildAdapterStreamResponse` (packages/ai/providers/anthropic +
 * OpenAIWireAssembler), for the SAME rich event scenario -- text, server-
 * managed web_search, thinking, and tool_use -- used in
 * stream-transform.golden.test.ts (structural `toEqual`, key-order-blind)
 * and packages/ai/providers/anthropic/src/__tests__/web-wire-parity.test.ts
 * (assembler-level only, no route/billing wiring).
 *
 * This suite closes the gap those two leave: an ACTUAL side-by-side byte
 * comparison of what the two REAL route functions produce for literally the
 * same input content, catching anything a hand-written `toEqual` expectation
 * could miss (key order already bit us once this way -- see
 * openai-wire-compat.ts's chunkEnvelope() history).
 *
 * Both legacy and adapter inputs are built from the SAME `richEvents` array
 * below so the two fixtures cannot silently drift apart.
 *
 * SCOPED TO THE `data:` CHANNEL ONLY -- see the module-level comment below
 * `stripToDataLines` for why `event: X` framing lines are excluded from this
 * comparison, and disclosed as a known divergence rather than reproduced.
 */

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
import { translateAnthropicStream } from '@agiworkforce/providers-anthropic';
import type { ProcessedRequest } from '../lib/request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-parity-001',
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

/**
 * Legacy `buildStreamResponse` passes Anthropic's raw `event: X` SSE-framing
 * lines through verbatim (confirmed by stream-transform.golden.test.ts's
 * "passes non-data: SSE lines through verbatim" case) -- a side effect of
 * apps/web/lib/llm-providers/anthropic.ts's raw-fetch passthrough
 * (`response.body` forwarded unmodified) plus stream-transform.ts's
 * catch-all `else if (line.trim())` branch.
 *
 * `buildAdapterStreamResponse` cannot reproduce this: `translateAnthropicStream`
 * consumes the `@anthropic-ai/sdk` MessageStream helper's ALREADY-PARSED
 * `MessageStreamEvent` objects, which carry no raw `event:` line at all --
 * there is nothing to re-emit even if a mechanism existed to do so. This is
 * disclosed, not silently reproduced-away, per two independent checks:
 *
 * 1. Every real consumer pinned to this endpoint parses ONLY `data:` lines
 *    (verified by reading the actual source: apps/desktop/src-tauri/src/
 *    core/llm/sse_parser.rs's content-parsing path, apps/mobile/services/
 *    streaming.ts, apps/extension/.../cloudAgentClient.ts, apps/extension-
 *    vscode/src/utils/api.ts's httpsPostStream -- all four hand-roll a
 *    `line.startsWith('data:')` filter, none use EventSource or a named-
 *    event-dispatching SSE library). EventSource (the only SSE API that
 *    dispatches on `event:` names) is GET-only and cannot even be used
 *    against this POST endpoint, so no spec-compliant client could depend
 *    on `event:` dispatch here regardless.
 * 2. The legacy `event: X` passthrough is not well-formed to depend on
 *    anyway: `event: content_block_start` is immediately followed by a
 *    DROPPED data line for text/tool_use blocks (stream-transform.ts's
 *    `continue`), and `event: content_block_delta` precedes a RESHAPED
 *    `data: {choices:...}` OpenAI-shaped chunk it no longer describes --
 *    orphaned, incoherent names, not a reconstructable byte contract.
 *
 * ONE EXCEPTION FOUND, flagged separately in the task #34 handoff and
 * MITIGATED (not reproduced) by `../lib/sse-heartbeat.ts`: desktop's
 * sse_parser.rs also has an `event: ping` / `event:ping` keepalive-detection
 * branch (is_keepalive_event). Anthropic's real API sends `event: ping`
 * during long idle periods (e.g. extended thinking with no visible output)
 * to prevent proxy/load-balancer timeouts; the legacy raw-fetch passthrough
 * forwards these today. The `@anthropic-ai/sdk` MessageStream helper
 * swallows `ping` events internally and unconditionally (`core/
 * streaming.ts`: `if (sse.event === 'ping') { continue; }`) BEFORE they ever
 * reach `translateAnthropicStream` -- there is no code path, in this
 * package or any other, that could recover Anthropic's OWN ping frames from
 * the SDK. Per team-lead's direction, `buildAdapterStreamResponse` (and
 * `buildStreamResponse`, for every other provider too) now wraps its body
 * in `withSseHeartbeat`, which emits a provider-independent `: keepalive`
 * SSE comment during genuine idle periods -- this keeps the client-facing
 * connection warm without depending on any specific provider's own
 * keepalive convention, but it means desktop's `event:ping`-specific
 * detection branch will simply never match for Anthropic-routed traffic
 * (harmless: a `: keepalive` comment line is silently ignored by every
 * `data:`-only parser, same as any other non-`data:` line).
 */
function stripToDataLines(body: string): string {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .join('\n');
}

/** Anthropic's `sdk.messages.stream()` yields already-parsed
 *  `MessageStreamEvent` objects -- feed the SAME event objects used to
 *  build the legacy raw SSE text (below) into `translateAnthropicStream`
 *  directly, so both pipelines run off one shared fixture. */
async function* asAnthropicEvents(events: unknown[]): AsyncIterable<Anthropic.MessageStreamEvent> {
  for (const event of events) yield event as Anthropic.MessageStreamEvent;
}

/** Build a raw upstream ReadableStream with `event: X` / `data: {...}`
 *  framing, matching what anthropic.ts's streamRequest forwards (fetch's
 *  raw response.body, unmodified -- see lib/llm-providers/anthropic.ts). */
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

// Shared fixture: text, server-managed web_search, thinking, tool_use --
// identical content to stream-transform.golden.test.ts's first case and
// web-wire-parity.test.ts's first case (reconciled here into one source of
// truth so this comparison can't accidentally compare non-equivalent
// scenarios).
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

    // Sanity: prove the comparison is non-trivial (both sides produced real
    // content), so a future regression that empties both sides can't make
    // this test pass vacuously.
    expect(legacyBody.length).toBeGreaterThan(100);

    expect(stripToDataLines(adapterBody)).toBe(stripToDataLines(legacyBody));
  });
});

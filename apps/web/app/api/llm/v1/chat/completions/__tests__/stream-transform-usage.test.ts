/**
 * stream-transform.ts · final OpenAI/OpenRouter usage event capture.
 *
 * When stream_options.include_usage=true is set, OpenAI emits a final SSE event
 * before [DONE] that contains a usage object with complete token counts including
 * cache hits and reasoning tokens. This suite verifies that buildStreamResponse
 * extracts and passes those counts to recordModelUsage via the flush handler.
 *
 * Test strategy: inject a ReadableStream containing a sequence of SSE events
 * (including the final usage event), attach a NextRequest stub, and observe the
 * calls to the mocked recordModelUsage.
 *
 * Only the flush path (post-stream analytics) is tested here; the transform
 * path (SSE passthrough) is covered by higher-level integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 0),
  },
}));

vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  recordFreeTrialTokens: vi.fn(() => Promise.resolve()),
}));

import { buildStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import { recordModelUsage } from '@/lib/cost-tracker';
import { recordFreeTrialTokens } from '@/lib/services/free-trial-service';

const mockRecordModelUsage = recordModelUsage as ReturnType<typeof vi.fn>;
const mockRecordFreeTrialTokens = recordFreeTrialTokens as ReturnType<typeof vi.fn>;

/** Create a minimal ProcessedRequest stub for buildStreamResponse. */
function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-test-001',
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

/** Build a ReadableStream from an array of SSE data lines. */
function makeStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => `data: ${e}\n`).join('\n') + '\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Minimal NextRequest stub (only headers used by buildStreamResponse). */
function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Consume all chunks from a ReadableStream to trigger the flush handler.
 * buildStreamResponse returns a NextResponse whose body is a streaming SSE;
 * we must fully consume it to guarantee flush() runs.
 */
async function drainStream(response: Response): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildStreamResponse · final OpenAI usage event capture', () => {
  it('captures prompt_tokens and completion_tokens from final usage event', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'gpt-5.5',
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed(),
      'user-001',
      'token-001',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-001',
      'gpt-5.5',
      expect.objectContaining({
        inputTokens: 120,
        outputTokens: 80,
      }),
    );
  });

  it('records actual free-tier stream usage without trial-budget headers', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'gpt-5.5',
        usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed({
        freeTrial: {
          kind: 'free_trial',
          userId: 'user-free',
          requestId: 'req-test-001',
        },
      } as any),
      'user-free',
      'token-free',
    );
    await drainStream(response as any);

    expect(mockRecordFreeTrialTokens).toHaveBeenCalledWith({
      userId: 'user-free',
      requestId: 'req-test-001',
      tokens: 200,
    });
    expect(response.headers.has('x-agi-trial-tokens-used')).toBe(false);
    expect(response.headers.has('x-agi-trial-tokens-budget')).toBe(false);
  });

  it('captures cached_tokens from prompt_tokens_details (Chat Completions shape)', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          prompt_tokens_details: { cached_tokens: 150 },
        },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed(),
      'user-002',
      'token-002',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-002',
      'gpt-5.5',
      expect.objectContaining({
        cacheReadInputTokens: 150,
      }),
    );
  });

  it('captures cached_tokens from input_tokens_details (Responses API shape)', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          input_tokens_details: { cached_tokens: 80 },
        },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed(),
      'user-003',
      'token-003',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-003',
      'gpt-5.5',
      expect.objectContaining({
        cacheReadInputTokens: 80,
      }),
    );
  });

  it('captures cache_creation_input_tokens from OpenRouter anthropic-routed response', async () => {
    const events = [
      JSON.stringify({
        choices: [{ delta: { content: 'Hi' }, index: 0 }],
        model: 'anthropic/claude-sonnet-4-6',
      }),
      JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 500,
          completion_tokens: 200,
          total_tokens: 700,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 400,
        },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed({ provider: 'openrouter', requestedModel: 'anthropic/claude-sonnet-4-6' }),
      'user-004',
      'token-004',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-004',
      expect.any(String),
      expect.objectContaining({
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 400,
      }),
    );
  });

  it('captures reasoning_tokens from completion_tokens_details (Chat Completions shape)', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Answer' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 400,
          total_tokens: 500,
          completion_tokens_details: { reasoning_tokens: 320 },
        },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed(),
      'user-005',
      'token-005',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-005',
      'gpt-5.5',
      expect.objectContaining({
        reasoningOutputTokens: 320,
      }),
    );
  });

  it('captures reasoning_tokens from output_tokens_details (Responses API shape)', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Answer' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 400,
          total_tokens: 500,
          output_tokens_details: { reasoning_tokens: 240 },
        },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed(),
      'user-006',
      'token-006',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-006',
      'gpt-5.5',
      expect.objectContaining({
        reasoningOutputTokens: 240,
      }),
    );
  });

  it('passes undefined reasoningOutputTokens when no reasoning details present', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' }, index: 0 }], model: 'gpt-5.5' }),
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
      }),
      '[DONE]',
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed(),
      'user-007',
      'token-007',
    );

    await drainStream(response as any);

    // reasoningOutputTokens should be undefined (not 0) when not present
    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-007',
      'gpt-5.5',
      expect.objectContaining({
        reasoningOutputTokens: undefined,
      }),
    );
  });
});

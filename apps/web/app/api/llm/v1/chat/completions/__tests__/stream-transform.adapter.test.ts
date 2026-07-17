/**
 * buildAdapterStreamResponse (stream-transform.ts) · the packages/ai/providers
 * adapter-path sibling of buildStreamResponse, proven separately in
 * stream-transform-usage.test.ts (the still-untouched legacy path) and
 * packages/ai/providers/anthropic/src/__tests__/web-wire-parity.test.ts (wire
 * bytes at the assembler level, no route/billing wiring).
 *
 * Neither of those exercises the REAL route function end-to-end with
 * billing: this suite feeds a StreamChunk sequence through
 * `buildAdapterStreamResponse` itself and asserts both (a) the exact SSE
 * bytes on the wire, including `data: [DONE]` framing, and (b)
 * CreditService.settleCreditsDurably / LLMCostCalculator.calculateCost /
 * recordModelUsage are called with the correct reconciliation math -- the
 * money path advisor flagged as unverified by the assembler-level parity
 * test alone.
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
vi.mock('@/lib/services/credit-service', () => ({
  CreditService: {
    generateIdempotencyKey: vi.fn(() => 'idempotency-key'),
    deductCredits: vi.fn(() => Promise.resolve()),
    settleCreditsDurably: vi.fn(() =>
      Promise.resolve({ status: 'succeeded', success: true, attempt_count: 1 }),
    ),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 4),
  },
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  recordFreeTrialTokens: vi.fn(() => Promise.resolve()),
}));

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';
import { CreditService } from '@/lib/services/credit-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { recordModelUsage } from '@/lib/cost-tracker';
import { logger } from '@/lib/logger';
import { recordFreeTrialTokens } from '@/lib/services/free-trial-service';

const mockSettleCreditsDurably = CreditService.settleCreditsDurably as ReturnType<typeof vi.fn>;
const mockCalculateCost = LLMCostCalculator.calculateCost as ReturnType<typeof vi.fn>;
const mockRecordModelUsage = recordModelUsage as ReturnType<typeof vi.fn>;
const mockLoggerInfo = logger.info as ReturnType<typeof vi.fn>;
const mockRecordFreeTrialTokens = recordFreeTrialTokens as ReturnType<typeof vi.fn>;

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-adapter-001',
    chatRequest: { model: 'claude-opus-4-8', messages: [], stream: true } as any,
    requestedModel: 'claude-opus-4-8',
    provider: 'anthropic',
    estimatedCostCents: 5,
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
    freeTrial: undefined,
    ...overrides,
  } as ProcessedRequest;
}

async function* chunksOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readAllText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCalculateCost.mockReturnValue(4);
});

describe('buildAdapterStreamResponse · wire bytes', () => {
  it('emits legacy-web-shaped SSE chunks and a terminal [DONE], byte for byte', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hello' },
      { type: 'usage', inputTokens: 120, outputTokens: 80 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed(),
      'user-001',
      'token-001',
      1_700_000_000_000,
    );

    const text = await readAllText(response as any);

    expect(text).toBe(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'claude-opus-4-8' })}`,
        '',
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'claude-opus-4-8' })}`,
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n'),
    );
  });
});

describe('buildAdapterStreamResponse · billing reconciliation', () => {
  it('calls LLMCostCalculator.calculateCost with the accumulated usage and reconciles the difference', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 120, outputTokens: 80, cacheReadTokens: 10 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({ estimatedCostCents: 5 }),
      'user-002',
      'token-002',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockCalculateCost).toHaveBeenCalledWith('anthropic', 'claude-opus-4-8', {
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      cacheReadInputTokens: 10,
      cacheCreationInputTokens: undefined,
      cacheCreation1hInputTokens: undefined,
    });

    // actualCostCents (mocked 4) - estimatedCostCents (5) = -1 !== 0 -> reconciles.
    expect(mockSettleCreditsDurably).toHaveBeenCalledWith({
      userId: 'user-002',
      amountCents: -1,
      description: 'Credit adjustment (streaming): anthropic/claude-opus-4-8',
      metadata: expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-opus-4-8',
        type: 'streaming_reconciliation',
        estimatedCostCents: 5,
        actualCostCents: 4,
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
        requestId: 'req-adapter-001',
      }),
      idempotencyKey: 'idempotency-key',
    });
  });

  it('skips reconciliation when actual cost matches the estimate exactly', async () => {
    mockCalculateCost.mockReturnValue(5);
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 100, outputTokens: 50 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({ estimatedCostCents: 5 }),
      'user-003',
      'token-003',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockSettleCreditsDurably).not.toHaveBeenCalled();
  });

  it('records actual tokens but skips paid reconciliation for a free-tier request', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 100, outputTokens: 50 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({
        estimatedCostCents: 0,
        freeTrial: {
          kind: 'free_trial',
          userId: 'user-004',
          requestId: 'req-adapter-001',
        } as any,
      }),
      'user-004',
      'token-004',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockSettleCreditsDurably).not.toHaveBeenCalled();
    expect(mockRecordFreeTrialTokens).toHaveBeenCalledWith({
      userId: 'user-004',
      requestId: 'req-adapter-001',
      tokens: 150,
    });
    expect(response.headers.has('x-agi-trial-tokens-used')).toBe(false);
    expect(response.headers.has('x-agi-trial-tokens-budget')).toBe(false);
  });

  it('records cache/reasoning usage fields for cost tracking', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      {
        type: 'usage',
        inputTokens: 500,
        outputTokens: 42,
        cacheReadTokens: 100,
        cacheWriteTokens: 400,
        cacheWrite1hTokens: 300,
        reasoningTokens: 20,
      },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed(),
      'user-005',
      'token-005',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-005',
      'claude-opus-4-8',
      expect.objectContaining({
        inputTokens: 500,
        outputTokens: 42,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 400,
        cacheCreation1hInputTokens: 300,
        reasoningOutputTokens: 20,
      }),
    );
  });
});

describe('buildAdapterStreamResponse · TTFT timing', () => {
  // Regression test for a real bug found while wiring this function into
  // route.ts: `startAnthropicStream` (adapter-factory.ts) awaits the first
  // StreamChunk before this function is even called (to detect an immediate
  // upstream error before committing to a 200 response), so a `Date.now()`
  // taken INSIDE this function would measure only the time since that peek
  // resolved -- always ~0ms -- silently breaking the `llm_ttft_slo_breach`
  // alert. `streamStartedAt` must be the caller's pre-peek timestamp.
  it('computes ttftMs relative to the caller-supplied streamStartedAt, not an internal clock', async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const chunks: StreamChunk[] = [
        { type: 'text-delta', delta: 'Hello' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'end_turn' },
      ];

      // Simulate startAnthropicStream's peek: 1500ms of real upstream
      // latency elapses BEFORE buildAdapterStreamResponse is ever invoked.
      vi.advanceTimersByTime(1500);

      const response = await buildAdapterStreamResponse(
        makeRequest() as any,
        chunksOf(chunks),
        makeProcessed(),
        'user-006',
        'token-006',
        start,
      );
      await readAllText(response as any);

      const ttftCall = mockLoggerInfo.mock.calls.find(
        (call) => (call[0] as { event?: string })?.event === 'llm_ttft_observed',
      );
      expect(ttftCall).toBeDefined();
      expect((ttftCall?.[0] as { ttftMs?: number })?.ttftMs).toBe(1500);
    } finally {
      vi.useRealTimers();
    }
  });
});

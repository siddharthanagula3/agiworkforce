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
 * managed usage finalization / LLMCostCalculator.calculateCost /
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
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  finalizeManagedUsageRequest: vi.fn(() => Promise.resolve()),
  markManagedUsageClientDelivered: vi.fn(() => Promise.resolve()),
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
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
}));

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { recordModelUsage } from '@/lib/cost-tracker';
import { logger } from '@/lib/logger';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';

const mockFinalizeManagedUsageRequest = finalizeManagedUsageRequest as ReturnType<typeof vi.fn>;
const mockCalculateCost = LLMCostCalculator.calculateCost as ReturnType<typeof vi.fn>;
const mockRecordModelUsage = recordModelUsage as ReturnType<typeof vi.fn>;
const mockLoggerInfo = logger.info as ReturnType<typeof vi.fn>;
const mockSettleFreeTrialRequest = settleFreeTrialRequest as ReturnType<typeof vi.fn>;

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-adapter-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true } as any,
    requestedModel: 'fixture-model',
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
    managedUsage: {
      db: {} as never,
      userId: 'user-paid',
      idempotencyKey: 'managed-request-001',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-001',
      estimatedCostCents: 5,
    },
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
  it('runs the successful-turn owner only after a clean provider stream', async () => {
    const onSuccessfulTurn = vi.fn(async () => undefined);
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf([
        { type: 'text-delta', delta: 'Hello' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'end_turn' },
      ]),
      makeProcessed(),
      'user-memory',
      'token-memory',
      1_700_000_000_000,
      'legacy-web',
      onSuccessfulTurn,
    );
    await readAllText(response as any);

    expect(onSuccessfulTurn).toHaveBeenCalledOnce();

    const failedOwner = vi.fn(async () => undefined);
    const failedResponse = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf([{ type: 'error', code: '503', message: 'upstream failed', retryable: true }]),
      makeProcessed(),
      'user-memory',
      'token-memory',
      1_700_000_000_000,
      'legacy-web',
      failedOwner,
    );
    await readAllText(failedResponse as any);

    expect(failedOwner).not.toHaveBeenCalled();
  });

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
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' }, index: 0 }], model: 'fixture-model' })}`,
        '',
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], model: 'fixture-model' })}`,
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n'),
    );
  });
});

describe('buildAdapterStreamResponse · billing reconciliation', () => {
  it('calculates accumulated usage and finalizes the actual cost', async () => {
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

    expect(mockCalculateCost).toHaveBeenCalledWith('anthropic', 'fixture-model', {
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      cacheReadInputTokens: 10,
      cacheCreationInputTokens: undefined,
      cacheCreation1hInputTokens: undefined,
    });

    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith({
      ...makeProcessed().managedUsage,
      outcome: 'completed',
      actualCostCents: 4,
      usage: {
        inputTokens: 120,
        outputTokens: 80,
        reasoningTokens: undefined,
        cacheReadTokens: 10,
        cacheWriteTokens: undefined,
        cacheWrite1hTokens: undefined,
        // CPST Stage-0 additive telemetry (design doc §4.3, phase 1). Asserted
        // exactly, so an unreviewed key cannot reach the ledger unnoticed. This
        // fixture carries a null task type and never rotated, so taskFamily,
        // taskFamilyConfidence, routePlanId, retries, and fallbackReason must
        // all stay absent.
        taskOutcome: 'unknown',
        verifierResult: 'skipped',
        fallbackUsed: false,
      },
    });
  });

  it('finalizes even when actual cost matches the estimate exactly', async () => {
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

    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed', actualCostCents: 5 }),
    );
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
        managedUsage: undefined,
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

    expect(mockFinalizeManagedUsageRequest).not.toHaveBeenCalled();
    expect(mockSettleFreeTrialRequest).toHaveBeenCalledWith({
      reservation: {
        kind: 'free_trial',
        userId: 'user-004',
        requestId: 'req-adapter-001',
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: 'fixture-model',
      usage: expect.objectContaining({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
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
      'fixture-model',
      expect.objectContaining({
        inputTokens: 500,
        outputTokens: 42,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 400,
        cacheCreation1hInputTokens: 300,
        reasoningOutputTokens: 20,
      }),
      expect.any(Date),
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

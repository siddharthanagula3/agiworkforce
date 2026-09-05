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
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
  isFreePlanTier: () => false,
  isFreeTrialRequest: () => false,
  beginFreeTrialRequest: vi.fn(),
  applyFreeTrialProviderBudget: vi.fn(),
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

describe('buildAdapterStreamResponse · secret redaction header', () => {
  it('carries the secret redaction count when the prompt was redacted', async () => {
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf([
        { type: 'text-delta', delta: 'Hello' },
        { type: 'stop', reason: 'end_turn' },
      ]),
      makeProcessed({ secretRedactionCount: 1 }),
      'user-redacted',
      'token-redacted',
      1_700_000_000_000,
      'legacy-web',
    );
    await readAllText(response as any);
    expect(response.headers.get('X-AGI-Secret-Redaction-Count')).toBe('1');
  });

  it('omits the secret redaction header when nothing was redacted', async () => {
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf([
        { type: 'text-delta', delta: 'Hello' },
        { type: 'stop', reason: 'end_turn' },
      ]),
      makeProcessed(),
      'user-clean',
      'token-clean',
      1_700_000_000_000,
      'legacy-web',
    );
    await readAllText(response as any);
    expect(response.headers.has('X-AGI-Secret-Redaction-Count')).toBe(false);
  });
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
        `data: ${JSON.stringify({
          choices: [{ delta: {}, index: 0 }],
          model: 'fixture-model',
          usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
        })}`,
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

    expect(mockCalculateCost).toHaveBeenCalledWith(
      'anthropic',
      'fixture-model',
      {
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
        cacheReadInputTokens: 10,
        cacheCreationInputTokens: undefined,
        cacheCreation1hInputTokens: undefined,
      },
      undefined,
      'anthropic/fixture-model',
    );

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
        costSource: 'estimated',
        taskOutcome: 'unknown',
        verifierResult: 'skipped',
        fallbackUsed: false,
      },
    });
  });

  it('prefers a gateway-reported cost within the catalog sanity band, and records that source', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 120, outputTokens: 80, costUsd: 0.02 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({ provider: 'openrouter', estimatedCostCents: 5 }),
      'user-002b',
      'token-002b',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockCalculateCost).toHaveBeenCalled();
    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostCents: 2,
        usage: expect.objectContaining({ costSource: 'provider_reported' }),
      }),
    );
  });

  it('ignores a zero gateway-reported cost on real usage and falls back to the estimate', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 120, outputTokens: 80, costUsd: 0 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({ provider: 'openrouter', estimatedCostCents: 5 }),
      'user-002c',
      'token-002c',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostCents: 4,
        usage: expect.objectContaining({ costSource: 'estimated' }),
      }),
    );
  });

  it('ignores a gateway-reported cost far below the catalog estimate and falls back to it', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 120, outputTokens: 80, costUsd: 0.00001 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({ provider: 'openrouter', estimatedCostCents: 5 }),
      'user-002d',
      'token-002d',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostCents: 4,
        usage: expect.objectContaining({ costSource: 'estimated' }),
      }),
    );
  });

  it('ignores a gateway-reported cost far above the catalog estimate and falls back to it', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text-delta', delta: 'Hi' },
      { type: 'usage', inputTokens: 120, outputTokens: 80, costUsd: 5 },
      { type: 'stop', reason: 'end_turn' },
    ];

    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(chunks),
      makeProcessed({ provider: 'openrouter', estimatedCostCents: 5 }),
      'user-002e',
      'token-002e',
      1_700_000_000_000,
    );
    await readAllText(response as any);

    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        actualCostCents: 4,
        usage: expect.objectContaining({ costSource: 'estimated' }),
      }),
    );
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
  it('computes ttftMs relative to the caller-supplied streamStartedAt, not an internal clock', async () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const chunks: StreamChunk[] = [
        { type: 'text-delta', delta: 'Hello' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'stop', reason: 'end_turn' },
      ];

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

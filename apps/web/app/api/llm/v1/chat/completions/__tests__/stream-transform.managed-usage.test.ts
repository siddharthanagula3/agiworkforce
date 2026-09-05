import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    generateIdempotencyKey: vi.fn(),
    settleCreditsDurably: vi.fn(),
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: { calculateCost: vi.fn(() => 2) },
  normalizeProviderId: (provider: string | null | undefined) => provider?.toLowerCase() ?? null,
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));

const lifecycle = vi.hoisted(() => ({
  finalize: vi.fn(),
  delivered: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/services/managed-usage-request-service', () => ({
  finalizeManagedUsageRequest: lifecycle.finalize,
  markManagedUsageClientDelivered: lifecycle.delivered,
  MANAGED_CHAT_CONTRACT_VERSION: 'fixture-contract-version',
  ManagedUsageRequestError: class ManagedUsageRequestError extends Error {
    constructor(
      message: string,
      public status: number,
      public code: string,
    ) {
      super(message);
      this.name = 'ManagedUsageRequestError';
    }
  },
  createManagedUsageErrorBody: vi.fn(),
  fingerprintManagedUsageRequest: vi.fn(() => 'fixture-fingerprint'),
  parseManagedUsageIdempotencyKey: vi.fn(
    (header: string | null) => header ?? 'fixture-idempotency-key',
  ),
  reserveManagedUsageRequest: vi.fn(),
  resolveManagedQuotaRecovery: vi.fn(() => null),
}));

import { buildStreamResponse } from '../lib/stream-transform';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import type { ProcessedRequest } from '../lib/request-processor';

function managedProcessed(): ProcessedRequest {
  return {
    chatSurface: 'web' as const,
    requestId: 'agi.chat.web.send.assistant-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true } as never,
    conversationId: undefined,
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    estimatedCostCents: 2,
    estimatedPromptTokens: 4,
    maxTokens: 2,
    quotaWarningHeader: null,
    quotaFeature: 'standard' as never,
    isFlagshipRequest: false,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'fixture-model',
    resolvedTaskType: 'general' as never,
    classifierConfidence: 1,
    resolvedSlot: null,
    indicResult: {
      isIndic: false,
      dominantScript: null,
      indicRatio: 0,
      indicCharCount: 0,
      totalCharCount: 0,
      scriptCounts: {
        devanagari: 0,
        bengali: 0,
        gurmukhi: 0,
        gujarati: 0,
        tamil: 0,
        telugu: 0,
        kannada: 0,
        malayalam: 0,
      },
    },
    managedUsage: {
      db: {} as never,
      userId: 'user-001',
      idempotencyKey: 'agi.chat.web.send.assistant-001',
      requestHash: 'hash-001',
      leaseToken: 'lease-001',
      estimatedCostCents: 2,
    },
    llmRequest: {
      model: 'fixture-model',
      messages: [],
      max_tokens: 2,
      stream: true,
    },
  };
}

function upstreamSse(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          [
            `data: ${JSON.stringify({
              choices: [{ delta: { content: 'Hello' }, index: 0 }],
              usage: { prompt_tokens: 4, completion_tokens: 2 },
            })}`,
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
        ),
      );
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildStreamResponse managed-usage terminal ordering', () => {
  it('does not expose [DONE] until the financial outcome is durable', async () => {
    let resolveFinalization!: () => void;
    lifecycle.finalize.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFinalization = () =>
            resolve({
              requestStatus: 'completed',
              operationResult: 'finalized',
              settlementStatus: 'succeeded',
              actualCostCents: 2,
            });
        }),
    );

    const response = await buildStreamResponse(
      new Request('https://example.com/api/llm/v1/chat/completions', {
        method: 'POST',
      }) as never,
      upstreamSse(),
      managedProcessed(),
      'user-001',
      'token-001',
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    const firstText = decoder.decode(first.value);
    expect(firstText).toContain('Hello');
    expect(firstText).not.toContain('[DONE]');
    await vi.waitFor(() => expect(lifecycle.finalize).toHaveBeenCalledOnce());

    resolveFinalization();

    let remainder = '';
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      remainder += decoder.decode(next.value, { stream: true });
    }
    expect(remainder).toContain('data: [DONE]');
    expect(lifecycle.delivered).toHaveBeenCalledOnce();
  });
});

describe('buildStreamResponse CPST usage telemetry', () => {
  async function drain(response: Response): Promise<void> {
    const reader = response.body!.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
    }
  }

  function finalizedUsage(): Record<string, unknown> {
    const call = lifecycle.finalize.mock.calls[0]?.[0] as { usage: Record<string, unknown> };
    return JSON.parse(JSON.stringify(call.usage));
  }

  it('adds the CPST keys alongside the token counters in one finalize call', async () => {
    lifecycle.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 2,
    });

    const processed = managedProcessed();
    processed.routePlanId = 'interim:anthropic/messages:route-1:preferred_slot';

    await drain(
      await buildStreamResponse(
        new Request('https://example.com/api/llm/v1/chat/completions', {
          method: 'POST',
        }) as never,
        upstreamSse(),
        processed,
        'user-001',
        'token-001',
      ),
    );

    expect(lifecycle.finalize).toHaveBeenCalledOnce();
    const usage = finalizedUsage();

    expect(usage['inputTokens']).toBe(4);
    expect(usage['outputTokens']).toBe(2);

    expect(usage['taskOutcome']).toBe('unknown');
    expect(usage['verifierResult']).toBe('skipped');
    expect(usage['fallbackUsed']).toBe(false);
    expect(usage['routePlanId']).toBe('interim:anthropic/messages:route-1:preferred_slot');
    expect(usage['taskFamily']).toBe('general');
    expect(usage['taskFamilyConfidence']).toBe(1);
  });

  it('keeps unknown fields absent rather than defaulting them', async () => {
    lifecycle.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 2,
    });

    await drain(
      await buildStreamResponse(
        new Request('https://example.com/api/llm/v1/chat/completions', {
          method: 'POST',
        }) as never,
        upstreamSse(),
        managedProcessed(),
        'user-001',
        'token-001',
      ),
    );

    const usage = finalizedUsage();
    expect('routePlanId' in usage).toBe(false);
    expect('retries' in usage).toBe(false);
    expect('fallbackReason' in usage).toBe(false);
  });

  it('settles with the tokens context compaction removed before the request was sent', async () => {
    lifecycle.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 2,
    });

    const processed = managedProcessed();
    processed.contextTrim = {
      droppedMessages: 3,
      truncatedMessages: 1,
      estimatedTokensBefore: 12_000,
      estimatedTokensAfter: 8_000,
      budgetTokens: 8_192,
    };

    await drain(
      await buildStreamResponse(
        new Request('https://example.com/api/llm/v1/chat/completions', {
          method: 'POST',
        }) as never,
        upstreamSse(),
        processed,
        'user-001',
        'token-001',
      ),
    );

    expect(finalizedUsage()['compactionSavedTokens']).toBe(4_000);
  });

  it('leaves the compaction counter absent when nothing was trimmed', async () => {
    lifecycle.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 2,
    });

    await drain(
      await buildStreamResponse(
        new Request('https://example.com/api/llm/v1/chat/completions', {
          method: 'POST',
        }) as never,
        upstreamSse(),
        managedProcessed(),
        'user-001',
        'token-001',
      ),
    );

    expect('compactionSavedTokens' in finalizedUsage()).toBe(false);
  });

  it('records a rotated attempt with its retry count and fallback reason', async () => {
    lifecycle.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 2,
    });

    const processed = managedProcessed();
    processed.usedFallback = true;
    processed.fallbackReason = 'managed_failover';
    processed.retries = 1;

    await drain(
      await buildStreamResponse(
        new Request('https://example.com/api/llm/v1/chat/completions', {
          method: 'POST',
        }) as never,
        upstreamSse(),
        processed,
        'user-001',
        'token-001',
      ),
    );

    const usage = finalizedUsage();
    expect(usage['fallbackUsed']).toBe(true);
    expect(usage['fallbackReason']).toBe('managed_failover');
    expect(usage['retries']).toBe(1);
  });

  it('prices the settlement at the serving route id', async () => {
    lifecycle.finalize.mockResolvedValue({
      requestStatus: 'completed',
      operationResult: 'finalized',
      settlementStatus: 'succeeded',
      actualCostCents: 2,
    });

    await drain(
      await buildStreamResponse(
        new Request('https://example.com/api/llm/v1/chat/completions', {
          method: 'POST',
        }) as never,
        upstreamSse(),
        managedProcessed(),
        'user-001',
        'token-001',
      ),
    );

    expect(LLMCostCalculator.calculateCost).toHaveBeenCalledWith(
      'anthropic',
      'fixture-model',
      expect.objectContaining({ promptTokens: 4, completionTokens: 2 }),
      undefined,
      'anthropic/fixture-model',
    );
  });
});

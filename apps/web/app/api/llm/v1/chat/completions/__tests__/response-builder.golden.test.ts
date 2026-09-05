import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
}));
vi.mock('@/lib/secure-random', () => ({
  secureToken: vi.fn(() => 'FIXEDTOKEN'),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  finalizeManagedUsageRequest: vi.fn(() => Promise.resolve()),
  markManagedUsageClientDelivered: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 123),
    getInputCostPerMtok: vi.fn(() => 300),
    getCacheWriteCostPerMtok: vi.fn(() => 300),
  },
  CACHE_WRITE_FALLBACK_MULTIPLIERS: { write5m: 1.25, write1h: 2 },
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));
vi.mock('@/lib/prompt-cache-helper', () => ({
  calculateCacheSavings: vi.fn(() => ({
    tokensSavedByCache: 0,
    savedCostCents: 0,
    cacheWriteCostCents: 0,
  })),
  logCacheAnalytics: vi.fn(),
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

import { buildNonStreamResponse } from '../lib/response-builder';
import type { ProcessedRequest } from '../lib/request-processor';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';

const mockSettleFreeTrialRequest = settleFreeTrialRequest as ReturnType<typeof vi.fn>;
const mockFinalizeManagedUsageRequest = finalizeManagedUsageRequest as ReturnType<typeof vi.fn>;

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-test-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: false } as any,
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    estimatedCostCents: 100,
    quotaWarningHeader: null,
    quotaFeature: 'standard' as any,
    isFlagshipRequest: false,
    usedFallback: false,
    resolvedTaskType: 'general' as any,
    classifierConfidence: 0.9,
    resolvedSlot: null,
    indicResult: { isIndic: false, dominantScript: null, indicRatio: 0 },
    originalModel: undefined,
    fallbackReason: undefined,
    managedUsage: {
      db: {} as never,
      userId: 'user-paid',
      idempotencyKey: 'managed-request-001',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-001',
      estimatedCostCents: 100,
    },
    ...overrides,
  } as ProcessedRequest;
}

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildNonStreamResponse golden fixture', () => {
  it('runs the successful-turn owner after durable billing settlement', async () => {
    const onSuccessfulTurn = vi.fn(async () => {
      expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledOnce();
    });

    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed({ estimatedCostCents: 100 }),
      'user-memory',
      'token-memory',
      onSuccessfulTurn,
    );

    expect(onSuccessfulTurn).toHaveBeenCalledOnce();
  });

  it('finalizes actual cost through the managed usage owner', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed({ estimatedCostCents: 100 }),
      'user-durable',
      'token-durable',
    );

    expect(mockFinalizeManagedUsageRequest).toHaveBeenCalledWith({
      ...makeProcessed().managedUsage,
      outcome: 'completed',
      actualCostCents: 123,
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
        cacheWrite1hTokens: undefined,
        taskOutcome: 'unknown',
        verifierResult: 'skipped',
        fallbackUsed: false,
        taskFamily: 'general',
        taskFamilyConfidence: 0.9,
      },
    });
  });

  it('serializes a plain text response with usage and cache token fields', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        cacheCreationInputTokens: 40,
        cachedInputTokens: 10,
      },
      makeProcessed(),
      'user-001',
      'token-001',
    );

    const json = await (response as any).json();
    expect(json).toEqual({
      id: expect.stringMatching(/^chatcmpl-\d+-FIXEDTOKEN$/),
      object: 'chat.completion',
      created: expect.any(Number),
      model: 'fixture-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello there' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        cache_creation_input_tokens: 40,
        cache_read_input_tokens: 10,
      },
      x_agi_workforce: {
        provider: 'anthropic',
        routing: {
          task_type: 'general',
          task_confidence: 0.9,
          resolved_model: 'fixture-model',
          slot: null,
          quota_warning: null,
        },
        cache: { tokens_saved: 0 },
      },
    });
    expect(json.x_agi_workforce).not.toHaveProperty('cost_cents');
    expect(json.x_agi_workforce.cache).not.toHaveProperty('cost_saved_cents');
  });

  it('reports how many secrets were redacted from the prompt before it was sent', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed({ secretRedactionCount: 2 }),
      'user-001',
      'token-001',
    );

    const json = await (response as any).json();
    expect(json.x_agi_workforce.secret_redaction).toEqual({
      count: 2,
      message: '2 secrets were removed from this message before it was sent.',
    });
  });

  it('omits secret_redaction when nothing was redacted', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed(),
      'user-001',
      'token-001',
    );

    const json = await (response as any).json();
    expect(json.x_agi_workforce).not.toHaveProperty('secret_redaction');
  });

  it('settles actual free-tier usage without publishing a numeric budget', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed({
        estimatedCostCents: 0,
        managedUsage: undefined,
        freeTrial: {
          kind: 'free_trial',
          userId: 'user-free',
          requestId: 'req-test-001',
        },
      } as any),
      'user-free',
      'token-free',
    );

    expect(mockSettleFreeTrialRequest).toHaveBeenCalledWith({
      reservation: {
        kind: 'free_trial',
        userId: 'user-free',
        requestId: 'req-test-001',
      },
      outcome: 'completed',
      provider: 'anthropic',
      model: 'fixture-model',
      usage: expect.objectContaining({
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      }),
    });
    expect(response.headers.has('x-agi-trial-tokens-used')).toBe(false);
    expect(response.headers.has('x-agi-trial-tokens-budget')).toBe(false);

    const json = await response.json();
    expect(json.x_agi_workforce.trial).toEqual({ type: 'free_trial' });
    expect(json.x_agi_workforce.trial).not.toHaveProperty('tokens_used');
    expect(json.x_agi_workforce.trial).not.toHaveProperty('token_budget');
  });

  it('includes citations and search_results only when non-empty (Anthropic web_search)', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'Cats are mammals [1].',
        finishReason: 'stop',
        promptTokens: 50,
        completionTokens: 10,
        totalTokens: 60,
        citations: [
          {
            type: 'web_search_result_location',
            cited_text: 'Cats are mammals',
            url: 'https://example.com',
          },
        ],
        search_results: [
          { type: 'web_search_tool_result', content: [{ url: 'https://example.com' }] },
        ],
      },
      makeProcessed(),
      'user-002',
      'token-002',
    );

    const json = await (response as any).json();
    expect(json.citations).toEqual([
      {
        type: 'web_search_result_location',
        cited_text: 'Cats are mammals',
        url: 'https://example.com',
      },
    ]);
    expect(json.search_results).toEqual([
      { type: 'web_search_tool_result', content: [{ url: 'https://example.com' }] },
    ]);
  });

  it('omits citations and search_results entirely when absent', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'hi',
        finishReason: 'stop',
        promptTokens: 5,
        completionTokens: 1,
        totalTokens: 6,
      },
      makeProcessed(),
      'user-003',
      'token-003',
    );

    const json = await (response as any).json();
    expect(json).not.toHaveProperty('citations');
    expect(json).not.toHaveProperty('search_results');
  });

  it('serializes tool_calls on the assistant message', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: '',
        finishReason: 'tool_calls',
        promptTokens: 30,
        completionTokens: 8,
        totalTokens: 38,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
          },
        ],
      },
      makeProcessed(),
      'user-004',
      'token-004',
    );

    const json = await (response as any).json();
    expect(json.choices[0].message.tool_calls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
      },
    ]);
    expect(json.choices[0].finish_reason).toBe('tool_calls');
  });

  it('defaults finish_reason to stop when the provider omits it', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'hi',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
      makeProcessed(),
      'user-005',
      'token-005',
    );

    const json = await (response as any).json();
    expect(json.choices[0].finish_reason).toBe('stop');
  });
});

describe('buildNonStreamResponse CPST usage telemetry', () => {
  function finalizedUsage(): Record<string, unknown> {
    const call = mockFinalizeManagedUsageRequest.mock.lastCall?.[0] as {
      usage: Record<string, unknown>;
    };
    return JSON.parse(JSON.stringify(call.usage));
  }

  it('writes the CPST keys in the same finalize call as the token counters', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'hi',
        promptTokens: 11,
        completionTokens: 3,
        totalTokens: 14,
      },
      makeProcessed({
        routePlanId: 'interim:anthropic/messages:route-1:preferred_slot',
        resolvedTaskType: 'coding' as any,
        classifierConfidence: 0.8,
      }),
      'user-cpst',
      'token-cpst',
    );

    const usage = finalizedUsage();
    expect(usage['inputTokens']).toBe(11);
    expect(usage['outputTokens']).toBe(3);
    expect(usage['taskOutcome']).toBe('unknown');
    expect(usage['verifierResult']).toBe('skipped');
    expect(usage['fallbackUsed']).toBe(false);
    expect(usage['routePlanId']).toBe('interim:anthropic/messages:route-1:preferred_slot');
    expect(usage['taskFamily']).toBe('coding');
    expect(usage['taskFamilyConfidence']).toBe(0.8);
  });

  it('leaves unknown CPST fields absent instead of defaulting them', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-model',
        content: 'hi',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
      makeProcessed(),
      'user-cpst-absent',
      'token-cpst-absent',
    );

    const usage = finalizedUsage();
    expect('routePlanId' in usage).toBe(false);
    expect('retries' in usage).toBe(false);
    expect('fallbackReason' in usage).toBe(false);
  });

  it('records the reason and retry count of a rotated attempt', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'fixture-rotated-model',
        content: 'hi',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
      makeProcessed({
        usedFallback: true,
        fallbackReason: 'managed_failover',
        retries: 2,
      }),
      'user-cpst-fallback',
      'token-cpst-fallback',
    );

    const usage = finalizedUsage();
    expect(usage['fallbackUsed']).toBe(true);
    expect(usage['fallbackReason']).toBe('managed_failover');
    expect(usage['retries']).toBe(2);
  });
});

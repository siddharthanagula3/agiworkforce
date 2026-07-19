/**
 * Golden fixtures for buildNonStreamResponse's CURRENT wire output.
 *
 * response-builder.ts is provider-agnostic (confirmed by reading it: it only
 * ever touches the normalized `llmResponse` shape lib/llm-providers/base.ts's
 * LLMProviderResponse defines, never a vendor SDK type) and is NOT being
 * rewritten by the Wave 2 step 5 migration. This suite exists to pin down
 * its exact JSON output for representative inputs -- most importantly the
 * `citations`/`search_results` top-level fields sourced today from
 * lib/llm-providers/anthropic.ts's sendRequest (see its L303-372) -- so the
 * eventual canonical-adapter response assembler has an executable target
 * for the `llmResponse` shape it must produce, not just a prose contract.
 *
 * Assertions were captured FROM the real implementation, not predicted.
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
  },
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
    chatRequest: { model: 'claude-opus-4-8', messages: [], stream: false } as any,
    requestedModel: 'claude-opus-4-8',
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
        model: 'claude-opus-4-8',
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
        model: 'claude-opus-4-8',
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
      },
    });
  });

  it('serializes a plain text response with usage and cache token fields', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'claude-opus-4-8',
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
      model: 'claude-opus-4-8',
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
          resolved_model: 'claude-opus-4-8',
          slot: null,
          quota_warning: null,
        },
        cache: { tokens_saved: 0 },
      },
    });
    expect(json.x_agi_workforce).not.toHaveProperty('cost_cents');
    expect(json.x_agi_workforce.cache).not.toHaveProperty('cost_saved_cents');
  });

  it('settles actual free-tier usage without publishing a numeric budget', async () => {
    const response = await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'claude-opus-4-8',
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
      model: 'claude-opus-4-8',
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
        model: 'claude-opus-4-8',
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
        model: 'claude-opus-4-8',
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
        model: 'claude-opus-4-8',
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
        model: 'claude-opus-4-8',
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

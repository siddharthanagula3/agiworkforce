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
  },
}));
vi.mock('@/lib/services/llm-cost-calculator', () => ({
  LLMCostCalculator: {
    calculateCost: vi.fn(() => 0),
  },
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
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

import { buildStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import { recordModelUsage } from '@/lib/cost-tracker';
import { settleFreeTrialRequest } from '@/lib/services/free-trial-service';

const mockRecordModelUsage = recordModelUsage as ReturnType<typeof vi.fn>;
const mockSettleFreeTrialRequest = settleFreeTrialRequest as ReturnType<typeof vi.fn>;

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-test-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true } as any,
    requestedModel: 'fixture-model',
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

function makeRequest(): Request {
  return new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

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
  it('captures Anthropic message_start usage before filtering the wire-silent event', async () => {
    const events = [
      JSON.stringify({
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 500,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 400,
            cache_creation: { ephemeral_1h_input_tokens: 300 },
          },
        },
      }),
      JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      }),
      JSON.stringify({
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 80 },
      }),
      JSON.stringify({ type: 'message_stop' }),
    ];

    const response = await buildStreamResponse(
      makeRequest() as any,
      makeStream(events),
      makeProcessed({ provider: 'anthropic' }),
      'user-anthropic-usage',
      'token-anthropic-usage',
    );

    await drainStream(response as any);

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-anthropic-usage',
      'fixture-model',
      expect.objectContaining({
        inputTokens: 500,
        outputTokens: 80,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 400,
        cacheCreation1hInputTokens: 300,
      }),
      expect.any(Date),
    );
  });

  it('captures prompt_tokens and completion_tokens from final usage event', async () => {
    const events = [
      JSON.stringify({
        choices: [{ delta: { content: 'Hello' }, index: 0 }],
        model: 'fixture-model',
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'fixture-model',
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
      'fixture-model',
      expect.objectContaining({
        inputTokens: 120,
        outputTokens: 80,
      }),
      expect.any(Date),
    );
  });

  it('records actual free-tier stream usage without trial-budget headers', async () => {
    const events = [
      JSON.stringify({
        choices: [{ delta: { content: 'Hello' }, index: 0 }],
        model: 'fixture-model',
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        model: 'fixture-model',
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

    expect(mockSettleFreeTrialRequest).toHaveBeenCalledWith({
      reservation: {
        kind: 'free_trial',
        userId: 'user-free',
        requestId: 'req-test-001',
      },
      outcome: 'completed',
      provider: 'openai',
      model: 'fixture-model',
      usage: expect.objectContaining({
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
      }),
    });
    expect(response.headers.has('x-agi-trial-tokens-used')).toBe(false);
    expect(response.headers.has('x-agi-trial-tokens-budget')).toBe(false);
  });

  it('captures cached_tokens from prompt_tokens_details (Chat Completions shape)', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' }, index: 0 }], model: 'fixture-model' }),
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
      'fixture-model',
      expect.objectContaining({
        cacheReadInputTokens: 150,
      }),
      expect.any(Date),
    );
  });

  it('captures cached_tokens from input_tokens_details (Responses API shape)', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' }, index: 0 }], model: 'fixture-model' }),
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
      'fixture-model',
      expect.objectContaining({
        cacheReadInputTokens: 80,
      }),
      expect.any(Date),
    );
  });

  it('captures cache_creation_input_tokens from OpenRouter anthropic-routed response', async () => {
    const events = [
      JSON.stringify({
        choices: [{ delta: { content: 'Hi' }, index: 0 }],
        model: 'vendor/fixture-model',
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
      makeProcessed({ provider: 'openrouter', requestedModel: 'vendor/fixture-model' }),
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
      expect.any(Date),
    );
  });

  it('captures reasoning_tokens from completion_tokens_details (Chat Completions shape)', async () => {
    const events = [
      JSON.stringify({
        choices: [{ delta: { content: 'Answer' }, index: 0 }],
        model: 'fixture-model',
      }),
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
      'fixture-model',
      expect.objectContaining({
        reasoningOutputTokens: 320,
      }),
      expect.any(Date),
    );
  });

  it('captures reasoning_tokens from output_tokens_details (Responses API shape)', async () => {
    const events = [
      JSON.stringify({
        choices: [{ delta: { content: 'Answer' }, index: 0 }],
        model: 'fixture-model',
      }),
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
      'fixture-model',
      expect.objectContaining({
        reasoningOutputTokens: 240,
      }),
      expect.any(Date),
    );
  });

  it('passes undefined reasoningOutputTokens when no reasoning details present', async () => {
    const events = [
      JSON.stringify({ choices: [{ delta: { content: 'Hi' }, index: 0 }], model: 'fixture-model' }),
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

    expect(mockRecordModelUsage).toHaveBeenCalledWith(
      'user-007',
      'fixture-model',
      expect.objectContaining({
        reasoningOutputTokens: undefined,
      }),
      expect.any(Date),
    );
  });
});

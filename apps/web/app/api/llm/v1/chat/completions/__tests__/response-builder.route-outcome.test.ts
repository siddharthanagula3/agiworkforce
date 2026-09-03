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
    getCacheReadCostPerMtok: vi.fn(() => 30),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
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

const mockRecordRouteOutcome = vi.fn(async (..._args: unknown[]) => undefined);
const mockRecordServedRouteAffinity = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  observeFreeLaneSettlement: vi.fn(),
  recordRouteOutcome: (...args: unknown[]) => mockRecordRouteOutcome(...args),
  recordServedRouteAffinity: (...args: unknown[]) => mockRecordServedRouteAffinity(...args),
  routeAffinityTtlMs: () => 3_600_000,
}));

vi.mock('@agiworkforce/model-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/model-registry')>();
  return { ...actual, getRoutePricing: () => ({ cacheClass: 'gateway_prompt_cache' }) };
});

import { buildNonStreamResponse, buildUpstreamErrorResponse } from '../lib/response-builder';
import type { ProcessedRequest } from '../lib/request-processor';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-non-stream-route-outcome',
    chatRequest: { model: 'glm-5.3', messages: [], stream: false } as any,
    requestedModel: 'glm-5.3',
    provider: 'open_router',
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
      idempotencyKey: 'managed-request-non-stream',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-non-stream',
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

function upstreamError(message: string, status?: number): Error {
  const error = new Error(message) as Error & { status?: number };
  if (status !== undefined) error.status = status;
  return error;
}

beforeEach(() => {
  mockRecordRouteOutcome.mockClear();
  mockRecordServedRouteAffinity.mockClear();
});

describe('buildNonStreamResponse, route outcome recording', () => {
  it('records a success outcome for the serving route', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'glm-5.3',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed(),
      'user-non-stream',
      'token-non-stream',
    );

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      'open_router/glm-5.3',
      { class: 'success', outputTokens: 20 },
      expect.any(Number),
    );
  });

  it('records served-route affinity when the turn has a conversation', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'glm-5.3',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed({ conversationId: 'conversation-non-stream' }),
      'user-non-stream',
      'token-non-stream',
    );

    expect(mockRecordServedRouteAffinity).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-non-stream',
        routeId: 'open_router/glm-5.3',
        ttlMs: 3_600_000,
      }),
    );
  });

  it('records no affinity for a turn with no conversation', async () => {
    await buildNonStreamResponse(
      makeRequest() as any,
      {
        model: 'glm-5.3',
        content: 'Hello there',
        finishReason: 'stop',
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
      },
      makeProcessed(),
      'user-non-stream',
      'token-non-stream',
    );

    expect(mockRecordServedRouteAffinity).not.toHaveBeenCalled();
  });
});

describe('buildUpstreamErrorResponse, route outcome recording', () => {
  it('maps a rate-limit rejection onto the rate_limit outcome class', () => {
    buildUpstreamErrorResponse(
      upstreamError('slow down', 429),
      'open_router',
      'glm-5.3',
      'glm-5.3',
      'user-non-stream',
      'req-1',
      'non-streaming',
    );

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      'open_router/glm-5.3',
      { class: 'rate_limit' },
      expect.any(Number),
    );
  });

  it('records nothing for a request-shaped failure that says nothing about the route', () => {
    buildUpstreamErrorResponse(
      Object.assign(new Error('content_filter triggered'), { status: 400 }),
      'open_router',
      'glm-5.3',
      'glm-5.3',
      'user-non-stream',
      'req-1',
      'non-streaming',
    );

    expect(mockRecordRouteOutcome).not.toHaveBeenCalled();
  });
});

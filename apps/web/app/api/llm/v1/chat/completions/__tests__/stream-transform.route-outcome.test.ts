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

const mockRecordRouteOutcome = vi.fn(async (..._args: unknown[]) => undefined);
const mockRecordServedRouteAffinity = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/services/free-lane/runtime-state-service', () => ({
  observeFreeLaneSettlement: vi.fn(),
  recordRouteOutcome: (...args: unknown[]) => mockRecordRouteOutcome(...args),
  recordServedRouteAffinity: (...args: unknown[]) => mockRecordServedRouteAffinity(...args),
  routeAffinityTtlMs: () => 3_600_000,
  getRouteHealthSnapshot: vi.fn(async () => ({})),
  getServedRouteAffinity: vi.fn(async () => null),
}));

vi.mock('@agiworkforce/model-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/model-registry')>();
  return { ...actual, getRoutePricing: () => ({ cacheClass: 'gateway_prompt_cache' }) };
});

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import type { StreamChunk } from '@agiworkforce/types';
import { getRoutePricingForModel } from '@agiworkforce/model-registry';

const MODEL = requireProviderDefaultModel('zhipu');
const OPEN_ROUTER_ROUTE = getRoutePricingForModel(MODEL).find(
  (route) => route.provider === 'open_router',
);
if (!OPEN_ROUTER_ROUTE) {
  throw new Error('The zhipu default model must carry an open_router route');
}
const OPEN_ROUTER_PROVIDER = OPEN_ROUTER_ROUTE.provider;
const OPEN_ROUTER_ROUTE_ID = OPEN_ROUTER_ROUTE.routeId;

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-route-outcome-001',
    chatRequest: { model: MODEL, messages: [], stream: true } as any,
    requestedModel: MODEL,
    provider: OPEN_ROUTER_PROVIDER,
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
      idempotencyKey: 'managed-request-route-outcome',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-route-outcome',
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

async function drainResponse(response: Response): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

const SUCCESSFUL_CHUNKS: StreamChunk[] = [
  { type: 'response-meta', provider: 'Together' },
  { type: 'text-delta', delta: 'Hello' },
  { type: 'usage', inputTokens: 10, outputTokens: 5 },
  { type: 'stop', reason: 'end_turn' },
];

describe('buildAdapterStreamResponse, route outcome recording', () => {
  beforeEach(() => {
    mockRecordRouteOutcome.mockClear();
    mockRecordServedRouteAffinity.mockClear();
  });

  it('records a success outcome for the serving route on the direct (no-MCP-tool) path', async () => {
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(SUCCESSFUL_CHUNKS),
      makeProcessed(),
      'user-direct',
      'token-direct',
      1_700_000_000_000,
    );
    await drainResponse(response as any);

    expect(mockRecordRouteOutcome).toHaveBeenCalledWith(
      OPEN_ROUTER_ROUTE_ID,
      expect.objectContaining({
        class: 'success',
        outputTokens: 5,
        durationMs: expect.any(Number),
      }),
      expect.any(Number),
    );
  });

  it('records served-route affinity, including the observed upstream provider, when the turn has a conversation', async () => {
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(SUCCESSFUL_CHUNKS),
      makeProcessed({ conversationId: 'conversation-route-outcome' }),
      'user-direct',
      'token-direct',
      1_700_000_000_000,
    );
    await drainResponse(response as any);

    expect(mockRecordServedRouteAffinity).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-route-outcome',
        routeId: OPEN_ROUTER_ROUTE_ID,
        ttlMs: 3_600_000,
        upstreamProvider: 'Together',
      }),
    );
  });

  it('records no affinity for a turn with no conversation', async () => {
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf(SUCCESSFUL_CHUNKS),
      makeProcessed(),
      'user-direct',
      'token-direct',
      1_700_000_000_000,
    );
    await drainResponse(response as any);

    expect(mockRecordServedRouteAffinity).not.toHaveBeenCalled();
  });

  it('records nothing when the stream errors before producing content', async () => {
    const response = await buildAdapterStreamResponse(
      makeRequest() as any,
      chunksOf([{ type: 'error', code: '503', message: 'upstream failed', retryable: true }]),
      makeProcessed(),
      'user-direct',
      'token-direct',
      1_700_000_000_000,
    );
    await drainResponse(response as any);

    expect(mockRecordRouteOutcome).not.toHaveBeenCalled();
    expect(mockRecordServedRouteAffinity).not.toHaveBeenCalled();
  });
});

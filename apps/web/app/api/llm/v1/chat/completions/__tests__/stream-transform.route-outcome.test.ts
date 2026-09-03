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

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-route-outcome-001',
    chatRequest: { model: 'glm-5.3', messages: [], stream: true } as any,
    requestedModel: 'glm-5.3',
    provider: 'open_router',
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
      'open_router/glm-5.3',
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
        routeId: 'open_router/glm-5.3',
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

import { describe, expect, it, vi, beforeEach } from 'vitest';
type ScanModule0 = typeof import('@/lib/logger');
type ScanModule1 = typeof import('@/lib/cors');
type ScanModule2 = typeof import('@/lib/services/llm-cost-calculator');
type ScanModule3 = typeof import('@/lib/prompt-cache-helper');
type ScanModule4 = typeof import('@/lib/cost-tracker');
type ScanModule5 = typeof import('@/lib/services/free-lane/runtime-state-service');
type ScanModule6 = typeof import('@/lib/services/model-rollout/routing-decision-trace-service');
type ScanModule7 = typeof import('@/lib/services/managed-usage-request-service');
type ScanModule8 = typeof import('@/lib/services/free-trial-service');
type ScanModule9 = typeof import('./assistant-turn-persistence');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/services/llm-cost-calculator', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  LLMCostCalculator: {
    calculateListCostMicrousd: () => null,
    calculateCostMicrousd: () => 0,
    calculateCost: () => 0,
  },
  normalizeProviderId: (p: string | null | undefined) => (typeof p === 'string' ? p : null),
}));
vi.mock('@/lib/prompt-cache-helper', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  calculateCacheSavings: () => null,
  logCacheAnalytics: vi.fn(),
}));
vi.mock('@/lib/cost-tracker', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  recordModelUsage: vi.fn(),
  toOtelAttributes: () => ({}),
}));
vi.mock('@/lib/services/free-lane/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  observeFreeLaneSettlement: vi.fn(),
  recordRouteOutcome: vi.fn(),
  recordServedRouteAffinity: vi.fn(),
  routeAffinityTtlMs: () => 0,
}));
vi.mock('@/lib/services/model-rollout/routing-decision-trace-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  persistRoutingDecisionOutcome: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule7>()),
  finalizeManagedUsageRequest: vi.fn(() => Promise.resolve()),
  markManagedUsageClientDelivered: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule8>()),
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
  isFreePlanTier: () => false,
}));
vi.mock('./assistant-turn-persistence', async (importOriginal) => ({
  ...(await importOriginal<ScanModule9>()),
  canPersistAssistantTurn: () => true,
  persistAssistantTurn: vi.fn(() => Promise.resolve()),
}));

import { buildNonStreamResponse } from './response-builder';
import { persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const mockPersist = persistAssistantTurn as ReturnType<typeof vi.fn>;

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-nonstream-001',
    chatRequest: { model: 'fixture-model', messages: [] },
    llmRequest: { model: 'fixture-model', messages: [] },
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    conversationId: 'conv-1',
    assistantMessageId: 'msg-1',
    estimatedCostCents: 0,
    quotaWarningHeader: null,
    quotaFeature: 'standard',
    isFlagshipRequest: false,
    usedFallback: false,
    resolvedTaskType: null,
    classifierConfidence: null,
    resolvedSlot: null,
    indicResult: { isIndic: false, dominantScript: null, indicRatio: 0 },
    managedUsage: {
      db: {},
      userId: 'user-1',
      idempotencyKey: 'agi.chat.web.send.nonstream-1',
      requestHash: 'a'.repeat(64),
      leaseToken: 'lease-1',
      estimatedCostCents: 0,
    },
  } as unknown as ProcessedRequest;
}

async function persistedTurn(
  content: string,
  finishReason: string,
): Promise<{ truncated: boolean }> {
  await buildNonStreamResponse(
    new Request('https://example.com/api/llm/v1/chat/completions', { method: 'POST' }) as never,
    {
      model: 'fixture-model',
      content,
      finishReason,
      promptTokens: 5,
      completionTokens: 0,
      totalTokens: 5,
    },
    makeProcessed(),
    'user-1',
    'token',
  );
  return mockPersist.mock.calls[0]?.[0].snapshot as { truncated: boolean };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildNonStreamResponse, a turn with nothing in it', () => {
  it('does not record an answerless turn as a complete one', async () => {
    expect(await persistedTurn('', 'stop')).toMatchObject({ truncated: true });
  });

  it('records a real answer as complete', async () => {
    expect(await persistedTurn('Here it is.', 'stop')).toMatchObject({ truncated: false });
  });
});

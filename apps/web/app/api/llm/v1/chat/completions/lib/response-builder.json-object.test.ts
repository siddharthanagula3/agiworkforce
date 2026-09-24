import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cors')>()),
  getCorsHeaders: () => ({}),
  getSecurityHeaders: () => ({}),
}));
vi.mock('@/lib/services/llm-cost-calculator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/llm-cost-calculator')>()),
  LLMCostCalculator: {
    calculateListCostMicrousd: () => null,
    calculateCostMicrousd: () => 0,
    calculateCost: () => 0,
  },
  normalizeProviderId: (p: string | null | undefined) => (typeof p === 'string' ? p : null),
}));
vi.mock('@/lib/prompt-cache-helper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/prompt-cache-helper')>()),
  calculateCacheSavings: () => null,
  logCacheAnalytics: vi.fn(),
}));
vi.mock('@/lib/cost-tracker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cost-tracker')>()),
  recordModelUsage: vi.fn(),
  toOtelAttributes: () => ({}),
}));
vi.mock('@/lib/services/free-lane/runtime-state-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-lane/runtime-state-service')>()),
  observeFreeLaneSettlement: vi.fn(),
  recordRouteOutcome: vi.fn(),
  recordServedRouteAffinity: vi.fn(),
  routeAffinityTtlMs: () => 0,
}));
vi.mock('@/lib/services/model-rollout/routing-decision-trace-service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/services/model-rollout/routing-decision-trace-service')
  >()),
  persistRoutingDecisionOutcome: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/managed-usage-request-service')>()),
  finalizeManagedUsageRequest: vi.fn(() => Promise.resolve()),
  markManagedUsageClientDelivered: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/services/free-trial-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/free-trial-service')>()),
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
  isFreePlanTier: () => false,
}));
vi.mock('./assistant-turn-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./assistant-turn-persistence')>()),
  canPersistAssistantTurn: () => true,
  persistAssistantTurn: vi.fn(() => Promise.resolve()),
}));

import { buildNonStreamResponse } from './response-builder';
import { persistAssistantTurn } from './assistant-turn-persistence';
import type { ProcessedRequest } from './request-processor';

const mockPersist = persistAssistantTurn as ReturnType<typeof vi.fn>;

function jsonObjectRequest(): ProcessedRequest {
  return {
    requestId: 'req-json-object-001',
    chatRequest: {
      model: 'fixture-model',
      messages: [],
      stream: false,
      response_format: { type: 'json_object' },
    },
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
      idempotencyKey: 'agi.chat.web.send.json-object-1',
      requestHash: 'b'.repeat(64),
      leaseToken: 'lease-1',
      estimatedCostCents: 0,
    },
  } as unknown as ProcessedRequest;
}

async function respond(content: string, finishReason: string) {
  const response = await buildNonStreamResponse(
    new Request('https://example.com/api/llm/v1/chat/completions', { method: 'POST' }) as never,
    {
      model: 'fixture-model',
      content,
      finishReason,
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12,
    },
    jsonObjectRequest(),
    'user-1',
    'token',
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      error?: { type: string; code: string; message: string };
      choices?: Array<{ message: { content: string } }>;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('json_object mode, the final state a caller receives', () => {
  it('returns the parsed object when the model finished normally', async () => {
    const { status, body } = await respond('```json\n{"total": 3}\n```', 'stop');

    expect(status).toBe(200);
    expect(body.choices?.[0]?.message.content).toBe('{"total":3}');
    expect(mockPersist).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal as a refusal, not as malformed JSON', async () => {
    const { status, body } = await respond('I will not help with that.', 'content_filter');

    expect(status).toBe(400);
    expect(body.error).toMatchObject({ type: 'content_filter', code: 'json_object_refused' });
    expect(body.error?.message).not.toMatch(/valid JSON/);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('treats a refusal stop as final even when the partial text parses', async () => {
    const { body } = await respond('{"partial": true}', 'refusal');

    expect(body.error?.code).toBe('json_object_refused');
  });

  it('reports an object cut off at the output limit as incomplete, and says how to fix it', async () => {
    const { status, body } = await respond('{"items": [1, 2, 3', 'length');

    expect(status).toBe(502);
    expect(body.error).toMatchObject({
      type: 'invalid_response_error',
      code: 'json_object_incomplete',
    });
    expect(body.error?.message).toMatch(/max_tokens/);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('accepts an object that completed exactly at the output limit', async () => {
    const { status, body } = await respond('{"done": true}', 'max_tokens');

    expect(status).toBe(200);
    expect(body.choices?.[0]?.message.content).toBe('{"done":true}');
  });

  it('reports prose from a model that finished normally as an invalid response', async () => {
    const { status, body } = await respond('Here is a summary without any JSON.', 'stop');

    expect(status).toBe(502);
    expect(body.error).toMatchObject({
      type: 'invalid_response_error',
      code: 'json_object_not_satisfied',
    });
    expect(body.error?.message).toMatch(/did not return valid JSON/);
  });
});

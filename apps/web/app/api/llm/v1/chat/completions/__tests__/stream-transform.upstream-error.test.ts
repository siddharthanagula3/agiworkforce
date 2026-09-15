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
    calculateListCost: vi.fn(() => null),
    calculateListCostMicrousd: vi.fn(() => null),
    estimateListCost: vi.fn(() => null),
    estimateListCostMicrousd: vi.fn(() => null),
    calculateCost: vi.fn(() => 4),
    calculateCostMicrousd: vi.fn(() => 40000),
  },
  normalizeProviderId: (provider: string | null | undefined) =>
    typeof provider === 'string' ? provider.toLowerCase() : null,
  isCacheTokensDisjointFromInput: vi.fn(() => false),
  resolveCacheRates: vi.fn(() => ({ read: 0, write5m: 0, write1h: 0 })),
}));
vi.mock('@/lib/cost-tracker', () => ({
  recordModelUsage: vi.fn(),
  toOtelAttributes: vi.fn(() => ({})),
}));
vi.mock('@/lib/services/free-trial-service', () => ({
  isEventPromotedRequest: () => false,
  settleFreeTrialRequest: vi.fn(() => Promise.resolve()),
  FREE_TRIAL_MODEL: 'fixture-free-trial-model',
  isFreePlanTier: () => false,
  isFreeTrialRequest: () => false,
  beginFreeTrialRequest: vi.fn(),
  applyFreeTrialProviderBudget: vi.fn(),
}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  markProviderDegraded: vi.fn(),
}));

import { buildAdapterStreamResponse } from '../lib/stream-transform';
import type { ProcessedRequest } from '../lib/request-processor';
import type { StreamChunk } from '@agiworkforce/types';
import { markProviderDegraded } from '@/lib/services/provider-availability-service';
import { finalizeManagedUsageRequest } from '@/lib/services/managed-usage-request-service';

const RAW_BILLING_BODY =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_fixture"}';
const BILLING_SENTENCE =
  'This model is unavailable right now because of a problem on our side, not with your request. Choose another model, or try again shortly.';

function makeProcessed(): ProcessedRequest {
  return {
    requestId: 'req-upstream-001',
    chatRequest: { model: 'fixture-model', messages: [], stream: true },
    requestedModel: 'fixture-model',
    provider: 'anthropic',
    estimatedCostCents: 5,
    quotaWarningHeader: null,
    quotaFeature: 'standard',
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
  } as unknown as ProcessedRequest;
}

async function* chunksOf(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

async function wireFrames(chunks: StreamChunk[]): Promise<{ text: string; events: any[] }> {
  const request = new Request('https://example.com/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const response = await buildAdapterStreamResponse(
    request as any,
    chunksOf(chunks),
    makeProcessed(),
    'user-upstream',
    'token-upstream',
    1_700_000_000_000,
    'legacy-web',
  );
  const text = await response.text();
  const events = text
    .split('\n')
    .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
    .map((line) => JSON.parse(line.slice(6)));
  return { text, events };
}

const streamErrorOf = (events: any[]) =>
  events.find((event) => event.choices?.[0]?.delta?.x_stream_error);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildAdapterStreamResponse · upstream error copy', () => {
  it('replaces a classified provider failure with the gateway sentence and code', async () => {
    const { text, events } = await wireFrames([
      {
        type: 'error',
        code: '400',
        message: RAW_BILLING_BODY,
        retryable: false,
        classification: {
          category: 'billing_exhausted',
          code: 'credit_balance_low',
          retryable: false,
          fallbackable: false,
          status: 400,
        },
      },
      { type: 'stop', reason: 'error' },
    ]);

    expect(text).not.toContain('credit balance');
    expect(text).not.toContain('req_fixture');
    const errorFrame = streamErrorOf(events);
    expect(errorFrame.choices[0].delta.x_stream_error).toEqual({
      message: BILLING_SENTENCE,
      code: 'provider_billing_exhausted',
      retryable: false,
    });
    expect(events.indexOf(errorFrame)).toBe(0);
    expect(events.at(-1).choices[0].finish_reason).toBe('error');
    expect(markProviderDegraded).toHaveBeenCalledWith('anthropic', 'billing_exhausted');
    expect(finalizeManagedUsageRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' }),
    );
  });

  it('classifies an unclassified failure from its status and message', async () => {
    const { events } = await wireFrames([
      { type: 'error', code: '400', message: RAW_BILLING_BODY, retryable: false },
    ]);

    expect(streamErrorOf(events).choices[0].delta.x_stream_error).toEqual({
      message: BILLING_SENTENCE,
      code: 'provider_billing_exhausted',
      retryable: false,
    });
  });

  it('keeps a retryable overload retryable under its own code', async () => {
    const { events } = await wireFrames([
      {
        type: 'error',
        code: '529',
        message: '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
        retryable: true,
        classification: {
          category: 'server_overload',
          code: 'overloaded_529',
          retryable: true,
          fallbackable: true,
          status: 529,
        },
      },
      { type: 'stop', reason: 'error' },
    ]);

    const streamError = streamErrorOf(events).choices[0].delta.x_stream_error;
    expect(streamError.code).toBe('provider_overloaded');
    expect(streamError.retryable).toBe(true);
    expect(streamError.message).not.toContain('overloaded_error');
    expect(markProviderDegraded).toHaveBeenCalledWith('anthropic', 'server_overload');
  });
});

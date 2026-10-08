import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerKeepsInputsOutOfTraining } from '@agiworkforce/model-registry';
import { listCanonicalModels } from '@agiworkforce/types';
type RequestProcessorModule = typeof import('./request-processor');
type FreeLanePlanModule = typeof import('@/lib/services/free-lane/plan');
type LoggerModule = typeof import('@/lib/logger');
type ProviderAdapterServiceModule = typeof import('@/lib/services/provider-adapter-service');

const canonical = listCanonicalModels();
const KEEPS_OUT_VIA_OPENROUTER = canonical.find(
  (model) => providerKeepsInputsOutOfTraining(model.provider) && !!model.openRouterSlug,
);
const KEEPS_OUT = canonical.find(
  (model) =>
    providerKeepsInputsOutOfTraining(model.provider) &&
    model.provider !== KEEPS_OUT_VIA_OPENROUTER?.provider,
);
const MAY_TRAIN = canonical.find((model) => !providerKeepsInputsOutOfTraining(model.provider));
if (!KEEPS_OUT_VIA_OPENROUTER || !KEEPS_OUT || !MAY_TRAIN) {
  throw new Error('Canonical training-policy failover fixtures are missing');
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockCanAccessModel = vi.fn();
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: (...args: unknown[]) => mockCanAccessModel(...args),
}));

vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<ProviderAdapterServiceModule>()),
  resolveProviderFromModel: vi.fn(),
  listAvailableManagedProviderIds: () => new Set<string>(),
}));

const mockNextFreeLaneRoute = vi.fn();
vi.mock('@/lib/services/free-lane/plan', async (importOriginal) => ({
  ...(await importOriginal<FreeLanePlanModule>()),
  nextFreeLaneRoute: (...args: unknown[]) => mockNextFreeLaneRoute(...args),
}));

vi.mock('./request-processor', async (importOriginal) => ({
  ...(await importOriginal<RequestProcessorModule>()),
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import { createFailoverPlan } from './managed-failover';
import type { ProcessedRequest } from './request-processor';

function httpError(status: number): Error {
  return Object.assign(new Error(`upstream ${status}`), { status });
}

function request(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  const model = KEEPS_OUT_VIA_OPENROUTER!.id;
  return {
    requestId: 'req-training-1',
    chatRequest: {
      model,
      messages: [{ role: 'user', content: 'hi' }],
    } as unknown as ProcessedRequest['chatRequest'],
    conversationId: undefined,
    requestedModel: 'auto',
    provider: KEEPS_OUT_VIA_OPENROUTER!.provider,
    estimatedCostCents: 5,
    estimatedPromptTokens: 10,
    maxTokens: 100,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'auto',
    fallbackRoutes: [],
    subscriptionTier: 'pro',
    resolvedTaskType: 'simple_chat',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as ProcessedRequest['quotaFeature'],
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: { isIndic: false } as ProcessedRequest['indicResult'],
    llmRequest: {
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    } as unknown as ProcessedRequest['llmRequest'],
    ...overrides,
  } as ProcessedRequest;
}

function makePlan(processed: ProcessedRequest) {
  return createFailoverPlan(processed, {
    signal: new AbortController().signal,
    isProviderDispatchable: () => true,
    modelPolicy: null,
  });
}

const savedKey = process.env['OPENROUTER_API_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
  process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
  mockCanAccessModel.mockReturnValue(true);
  mockNextFreeLaneRoute.mockReturnValue(null);
});

afterEach(() => {
  if (savedKey === undefined) delete process.env['OPENROUTER_API_KEY'];
  else process.env['OPENROUTER_API_KEY'] = savedKey;
});

describe('managed failover honours the provider-training opt-out', () => {
  it('retries through OpenRouter when the account has not opted out', () => {
    const attempt = makePlan(request()).next(httpError(503));

    expect(attempt?.provider).toBe('openrouter');
  });

  it('does not retry through OpenRouter for an account that opted out', () => {
    const attempt = makePlan(request({ noTrainingOnly: true })).next(httpError(503));

    expect(attempt).toBeNull();
  });

  it('skips a planned model whose provider may train and serves one that does not', () => {
    const plan = makePlan(
      request({
        noTrainingOnly: true,
        fallbackRoutes: [
          {
            modelKey: MAY_TRAIN!.id,
            provider: MAY_TRAIN!.provider,
            routeId: 'route-may-train',
            harnessId: 'harness-a',
          },
          {
            modelKey: KEEPS_OUT!.id,
            provider: KEEPS_OUT!.provider,
            routeId: 'route-keeps-out',
            harnessId: 'harness-b',
          },
        ],
      }),
    );

    const attempt = plan.next(httpError(503));

    expect(attempt?.model).toBe(KEEPS_OUT!.id);
    expect(attempt?.provider).toBe(KEEPS_OUT!.provider);
  });

  it('skips a planned route that carries a no-training model over a transport that may train', () => {
    const plan = makePlan(
      request({
        noTrainingOnly: true,
        fallbackRoutes: [
          {
            modelKey: KEEPS_OUT!.id,
            provider: 'open_router',
            routeId: 'route-via-aggregator',
            harnessId: 'harness-a',
          },
        ],
      }),
    );

    expect(plan.next(httpError(503))).toBeNull();
  });

  it('skips a free-lane route that may train for an account that opted out', () => {
    mockNextFreeLaneRoute
      .mockReturnValueOnce({
        routeId: 'free-route-may-train',
        modelKey: MAY_TRAIN!.id,
        provider: MAY_TRAIN!.provider,
        harnessId: 'harness-free',
      })
      .mockReturnValueOnce(null);
    const plan = makePlan(
      request({
        noTrainingOnly: true,
        freeLane: { dispatchedRouteId: 'free-route-first' } as ProcessedRequest['freeLane'],
      }),
    );

    expect(plan.next(httpError(503))).toBeNull();
    expect(mockNextFreeLaneRoute).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyRuntimeState,
  type AutoFallbackRoute,
  type FreeEligibility,
  type QuotaPool,
  type RoutingRuntimeState,
} from '@agiworkforce/routing';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockCanAccessModel = vi.fn();
vi.mock('@/lib/model-tiers', () => ({
  canAccessModel: (...args: unknown[]) => mockCanAccessModel(...args),
}));

const mockResolveProviderFromModel = vi.fn();
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: (...args: unknown[]) => mockResolveProviderFromModel(...args),
  listAvailableManagedProviderIds: () => new Set<string>(),
}));

// Made to say yes on purpose: the point of these tests is that the free lane
// refuses the same-model OpenRouter retry even when it is otherwise available.
const mockCanFailoverToOpenRouter = vi.fn();
vi.mock('@/lib/services/aggregator-routing', () => ({
  canFailoverToOpenRouter: (...args: unknown[]) => mockCanFailoverToOpenRouter(...args),
  dispatchProviderForRoute: vi.fn(),
  isManagedOpenRouterRoute: vi.fn(() => false),
  openRouterSlugFor: vi.fn(),
  validateRouteSelection: vi.fn(),
}));

vi.mock('./request-processor', () => ({
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import { createFailoverPlan } from './managed-failover';
import type { ProcessedRequest } from './request-processor';
import { FREE_LANE_MODES, type FreeLaneMode } from '@/lib/services/free-lane/mode';
import { toFreeAutoCandidate, type FreeLanePlan } from '@/lib/services/free-lane/plan';

const NOW_MS = Date.now();
const BIG_ROUTE = 'free-alpha/model-large';
const FAST_ROUTE = 'free-alpha/model-small';
const PAID_MODEL = 'model-paid';

function httpError(status: number, message = `upstream ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

function route(routeId: string, modelKey: string): AutoFallbackRoute {
  return {
    routeId,
    modelKey,
    provider: 'free-alpha',
    providerModelId: `openai/${modelKey}`,
    harnessId: 'free-alpha/chat',
  };
}

function eligibility(routeId: string, quotaPoolId: string): FreeEligibility {
  return {
    routeId,
    quotaPoolId,
    terms: {
      commercialUseAllowed: true,
      thirdPartyServingAllowed: true,
      proxyingAllowed: true,
      promptsExcludedFromTraining: true,
    },
    verifiedAtMs: NOW_MS - 1_000,
    verificationSource: 'https://example.invalid/terms',
  };
}

function pool(id: string, routeIds: string[], headroomFraction: number): QuotaPool {
  return { id, routeIds, headroomFraction, hardStopsBeforePaid: true };
}

function freeState(): RoutingRuntimeState {
  return {
    ...emptyRuntimeState(NOW_MS),
    freeEligibility: {
      [BIG_ROUTE]: eligibility(BIG_ROUTE, 'pool-big'),
      [FAST_ROUTE]: eligibility(FAST_ROUTE, 'pool-fast'),
    },
    quotaPools: {
      'pool-big': pool('pool-big', [BIG_ROUTE], 0.9),
      'pool-fast': pool('pool-fast', [FAST_ROUTE], 0.4),
    },
  };
}

function freeLanePlan(
  mode: FreeLaneMode = FREE_LANE_MODES.strict,
  state: RoutingRuntimeState = freeState(),
): FreeLanePlan {
  const routes = [route(BIG_ROUTE, 'model-large'), route(FAST_ROUTE, 'model-small')];
  return {
    mode,
    candidates: routes.map(toFreeAutoCandidate),
    state,
    routesByRouteId: new Map(routes.map((entry) => [entry.routeId, entry])),
    dispatchedRouteId: BIG_ROUTE,
  };
}

function makeProcessed(overrides: Partial<ProcessedRequest> = {}): ProcessedRequest {
  return {
    requestId: 'req-free',
    chatRequest: {
      model: 'model-large',
      messages: [{ role: 'user', content: 'hi' }],
    } as unknown as ProcessedRequest['chatRequest'],
    conversationId: undefined,
    requestedModel: 'auto-economy',
    provider: 'free-alpha',
    estimatedCostCents: 0,
    estimatedPromptTokens: 10,
    maxTokens: 100,
    usedFallback: false,
    fallbackReason: undefined,
    originalModel: 'auto-economy',
    fallbackModels: ['model-small'],
    subscriptionTier: 'free',
    resolvedTaskType: 'simple_chat',
    classifierConfidence: 1,
    resolvedSlot: null,
    quotaFeature: 'chat' as ProcessedRequest['quotaFeature'],
    quotaWarningHeader: null,
    isFlagshipRequest: false,
    indicResult: { isIndic: false } as ProcessedRequest['indicResult'],
    llmRequest: {
      model: 'model-large',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 100,
    } as unknown as ProcessedRequest['llmRequest'],
    freeLane: freeLanePlan(),
    ...overrides,
  } as ProcessedRequest;
}

function makePlan(
  processed: ProcessedRequest,
  onAttemptFailure?: Parameters<typeof createFailoverPlan>[1]['onAttemptFailure'],
) {
  return createFailoverPlan(processed, {
    signal: new AbortController().signal,
    isProviderDispatchable: () => true,
    ...(onAttemptFailure ? { onAttemptFailure } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCanAccessModel.mockReturnValue(true);
  mockResolveProviderFromModel.mockReturnValue('paid-beta');
  mockCanFailoverToOpenRouter.mockReturnValue(true);
});

describe('free-lane rotation re-enters the stage', () => {
  it('rotates to the next zero-cost route rather than the paid plan', () => {
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt).not.toBeNull();
    expect(attempt!.model).toBe('model-small');
    expect(attempt!.provider).toBe('free-alpha');
  });

  it('excludes the route that just failed', () => {
    const plan = makePlan(makeProcessed());
    expect(plan.next(httpError(503))!.model).toBe('model-small');
    expect(plan.next(httpError(503))).toBeNull();
  });

  it('moves the plan forward so settlement names the route that served', () => {
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt!.processed.freeLane?.dispatchedRouteId).toBe(FAST_ROUTE);
  });

  it('skips a route the stage has parked as unhealthy', () => {
    const state = freeState();
    const plan = makePlan(
      makeProcessed({
        freeLane: freeLanePlan(FREE_LANE_MODES.strict, {
          ...state,
          routeHealth: { [FAST_ROUTE]: { available: false, reason: 'circuit_open' } },
        }),
      }),
    );
    expect(plan.next(httpError(503))).toBeNull();
  });

  it('skips a route whose pool is spent', () => {
    const state = freeState();
    const plan = makePlan(
      makeProcessed({
        freeLane: freeLanePlan(FREE_LANE_MODES.strict, {
          ...state,
          quotaPools: { ...state.quotaPools, 'pool-fast': pool('pool-fast', [FAST_ROUTE], 0) },
        }),
      }),
    );
    expect(plan.next(httpError(503))).toBeNull();
  });
});

describe('free-lane rotation never reaches paid capacity', () => {
  it('refuses the same-model OpenRouter retry that a managed request would take', () => {
    const attempt = makePlan(makeProcessed()).next(httpError(503));
    expect(attempt!.provider).toBe('free-alpha');
    expect(mockCanFailoverToOpenRouter).not.toHaveBeenCalled();
  });

  it('ends the request rather than rotating onto the paid plan, in strict mode', () => {
    const plan = makePlan(
      makeProcessed({
        fallbackModels: [PAID_MODEL],
        freeLane: freeLanePlan(FREE_LANE_MODES.strict, emptyRuntimeState(NOW_MS)),
      }),
    );
    expect(plan.next(httpError(503))).toBeNull();
    expect(mockResolveProviderFromModel).not.toHaveBeenCalled();
  });

  it('ends the request rather than rotating onto the paid plan, in prefer mode too', () => {
    const plan = makePlan(
      makeProcessed({
        fallbackModels: [PAID_MODEL],
        freeLane: freeLanePlan(FREE_LANE_MODES.prefer, emptyRuntimeState(NOW_MS)),
      }),
    );
    expect(plan.next(httpError(503))).toBeNull();
    expect(mockResolveProviderFromModel).not.toHaveBeenCalled();
  });

  it('still refuses to rotate on a class that must never rotate', () => {
    const plan = makePlan(makeProcessed());
    expect(plan.next(httpError(402, 'credit balance is too low'))).toBeNull();
  });
});

describe('attempt-failure reporting', () => {
  it('names the route, provider and classification of the attempt that failed', () => {
    const observed = vi.fn();
    makePlan(makeProcessed(), observed).next(httpError(429, 'rate limit exceeded'));

    expect(observed).toHaveBeenCalledTimes(1);
    expect(observed.mock.calls[0]![0]).toMatchObject({
      routeId: BIG_ROUTE,
      provider: 'free-alpha',
      model: 'model-large',
      category: 'rate_limit',
    });
  });

  it('reports a failure class that will never rotate', () => {
    const observed = vi.fn();
    makePlan(makeProcessed(), observed).next(httpError(402, 'credit balance is too low'));

    expect(observed).toHaveBeenCalledTimes(1);
    expect(observed.mock.calls[0]![0]).toMatchObject({
      routeId: BIG_ROUTE,
      category: 'billing_exhausted',
    });
  });

  it('reports the second attempt under the route that actually served it', () => {
    const observed = vi.fn();
    const plan = makePlan(makeProcessed(), observed);
    plan.next(httpError(503));
    plan.next(httpError(503));

    expect(observed.mock.calls.map((call) => call[0].routeId)).toEqual([BIG_ROUTE, FAST_ROUTE]);
  });

  it('reports nothing for a request that is not on the free lane', () => {
    const observed = vi.fn();
    makePlan(makeProcessed({ freeLane: undefined }), observed).next(httpError(503));
    expect(observed.mock.calls[0]![0].routeId).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyRuntimeState,
  type FreeEligibility,
  type QuotaPool,
  type RoutingRuntimeState,
  type SelectedAutoRoute,
} from '@agiworkforce/routing';

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: loggerMock }));

const getFreeLaneRuntimeState = vi.fn();
vi.mock('./runtime-state-service', () => ({
  getFreeLaneRuntimeState: (...args: unknown[]) => getFreeLaneRuntimeState(...args),
}));

import { FREE_LANE_MODES } from './mode';
import { nextFreeLaneRoute } from './plan';
import {
  buildFreeCapacityUnavailableResponse,
  resolveFreeLaneOutcome,
  type FreeLaneOutcome,
} from './stage';

const NOW_MS = Date.UTC(2026, 8, 1, 12, 0);
const REQUEST_ID = 'req-free-1';

const FAST_ROUTE = 'free-alpha/model-small';
const BIG_ROUTE = 'free-alpha/model-large';
const PAID_ROUTE = 'paid-beta/model-paid';

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
    expiresAtMs: NOW_MS + 1_000_000,
  };
}

function pool(id: string, routeIds: string[], headroomFraction: number): QuotaPool {
  return { id, routeIds, headroomFraction, hardStopsBeforePaid: true, resetsAtMs: NOW_MS + 60_000 };
}

/** Both free routes verified; the fast one holds more headroom, so it ranks first. */
function healthyState(): RoutingRuntimeState {
  return {
    ...emptyRuntimeState(NOW_MS),
    freeEligibility: {
      [BIG_ROUTE]: eligibility(BIG_ROUTE, 'pool-big'),
      [FAST_ROUTE]: eligibility(FAST_ROUTE, 'pool-fast'),
    },
    quotaPools: {
      'pool-big': pool('pool-big', [BIG_ROUTE], 0.2),
      'pool-fast': pool('pool-fast', [FAST_ROUTE], 0.9),
    },
  };
}

function routeDecision(): SelectedAutoRoute {
  return {
    status: 'selected',
    requestedSelection: 'auto-economy',
    requestedProfile: 'economy',
    effectiveProfile: 'economy',
    taskType: 'simple_chat',
    modelKey: 'model-large',
    provider: 'free-alpha',
    providerModelId: 'vendor-api/model-large',
    routeId: BIG_ROUTE,
    harnessId: 'free-alpha/chat',
    reason: 'preferred_slot',
    fallbacks: [
      {
        modelKey: 'model-small',
        provider: 'free-alpha',
        providerModelId: 'vendor-api/model-small',
        routeId: FAST_ROUTE,
        harnessId: 'free-alpha/chat',
      },
      {
        modelKey: 'model-paid',
        provider: 'paid-beta',
        providerModelId: 'model-paid',
        routeId: PAID_ROUTE,
        harnessId: 'paid-beta/chat',
      },
    ],
  };
}

function outcome(
  mode: (typeof FREE_LANE_MODES)[keyof typeof FREE_LANE_MODES],
  freeRouteDecision: SelectedAutoRoute | null = routeDecision(),
): Promise<FreeLaneOutcome> {
  return resolveFreeLaneOutcome({
    mode,
    requestId: REQUEST_ID,
    nowMs: NOW_MS,
    freeRouteDecision,
    dispatchedRouteId: PAID_ROUTE,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getFreeLaneRuntimeState.mockResolvedValue(healthyState());
});

describe('off', () => {
  it('computes nothing at all', async () => {
    expect(await outcome(FREE_LANE_MODES.off)).toEqual({ kind: 'inactive' });
  });

  it('never reads the runtime snapshot, so it cannot change or delay a request', async () => {
    await outcome(FREE_LANE_MODES.off);
    expect(getFreeLaneRuntimeState).not.toHaveBeenCalled();
  });

  it('emits no log line', async () => {
    await outcome(FREE_LANE_MODES.off);
    expect(loggerMock.info).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});

describe('shadow', () => {
  it('never dispatches, even when a zero-cost route is available', async () => {
    expect(await outcome(FREE_LANE_MODES.shadow)).toEqual({ kind: 'observed' });
  });

  it('logs the selection and the rejections it would have made', async () => {
    await outcome(FREE_LANE_MODES.shadow);
    const [payload, message] = loggerMock.info.mock.calls[0]!;
    expect(message).toBe('[free-lane] stage decision');
    expect(payload).toMatchObject({
      mode: FREE_LANE_MODES.shadow,
      requestId: REQUEST_ID,
      status: 'selected',
      selectedRouteId: FAST_ROUTE,
      rankedRouteIds: [FAST_ROUTE, BIG_ROUTE],
    });
    expect(payload.rejected).toEqual([{ routeId: PAID_ROUTE, reason: 'not_verified_free' }]);
  });

  it('reports the route that actually served, not the one it picked', async () => {
    await outcome(FREE_LANE_MODES.shadow);
    expect(loggerMock.info.mock.calls[0]![0].dispatchedRouteId).toBe(PAID_ROUTE);
  });

  it('still does not dispatch when the stage strands', async () => {
    getFreeLaneRuntimeState.mockResolvedValue(emptyRuntimeState(NOW_MS));
    expect(await outcome(FREE_LANE_MODES.shadow)).toEqual({ kind: 'observed' });
  });
});

describe('prefer', () => {
  it('dispatches the stage head', async () => {
    const result = await outcome(FREE_LANE_MODES.prefer);
    expect(result.kind).toBe('dispatch');
    if (result.kind !== 'dispatch') return;
    expect(result.routeDecision.routeId).toBe(FAST_ROUTE);
    expect(result.routeDecision.modelKey).toBe('model-small');
    expect(result.routeDecision.providerModelId).toBe('vendor-api/model-small');
  });

  it('keeps only the ranked zero-cost tail as the failover plan', async () => {
    const result = await outcome(FREE_LANE_MODES.prefer);
    if (result.kind !== 'dispatch') throw new Error('expected a dispatch');
    expect(result.routeDecision.fallbacks.map((route) => route.routeId)).toEqual([BIG_ROUTE]);
  });

  it('falls through rather than stranding when the stage finds nothing', async () => {
    getFreeLaneRuntimeState.mockResolvedValue(emptyRuntimeState(NOW_MS));
    expect(await outcome(FREE_LANE_MODES.prefer)).toEqual({ kind: 'observed' });
  });

  it('falls through when the resolver admitted no free route at all', async () => {
    expect(await outcome(FREE_LANE_MODES.prefer, null)).toEqual({ kind: 'observed' });
  });
});

describe('strict', () => {
  it('dispatches the stage head', async () => {
    const result = await outcome(FREE_LANE_MODES.strict);
    expect(result.kind).toBe('dispatch');
    if (result.kind !== 'dispatch') return;
    expect(result.routeDecision.routeId).toBe(FAST_ROUTE);
  });

  it('strands rather than falling through to a paid route', async () => {
    getFreeLaneRuntimeState.mockResolvedValue(emptyRuntimeState(NOW_MS));
    const result = await outcome(FREE_LANE_MODES.strict);
    expect(result.kind).toBe('stranded');
    if (result.kind !== 'stranded') return;
    expect(result.decision.rejected.map((entry) => entry.reason)).toEqual([
      'not_verified_free',
      'not_verified_free',
      'not_verified_free',
    ]);
  });

  it('strands when the resolver admitted no free route at all', async () => {
    expect((await outcome(FREE_LANE_MODES.strict, null)).kind).toBe('stranded');
  });

  it('is inert, not stranding, for a request the lane does not cover', async () => {
    expect(await outcome(FREE_LANE_MODES.off, null)).toEqual({ kind: 'inactive' });
  });

  it('strands when every pool is spent, carrying the reset time forward', async () => {
    const state = healthyState();
    getFreeLaneRuntimeState.mockResolvedValue({
      ...state,
      quotaPools: {
        'pool-big': pool('pool-big', [BIG_ROUTE], 0),
        'pool-fast': pool('pool-fast', [FAST_ROUTE], 0),
      },
    });
    const result = await outcome(FREE_LANE_MODES.strict);
    if (result.kind !== 'stranded') throw new Error('expected a strand');
    expect(result.decision.earliestRetryAtMs).toBe(NOW_MS + 60_000);
  });
});

describe('the stranded response', () => {
  it('is a machine-readable 429 naming both ways out', async () => {
    const response = buildFreeCapacityUnavailableResponse(
      { status: 'free_capacity_unavailable', rejected: [], earliestRetryAtMs: NOW_MS + 90_000 },
      NOW_MS,
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('90');

    const body = await response.json();
    expect(body.error).toMatchObject({
      type: 'insufficient_quota',
      code: 'free_capacity_unavailable',
      retry_at: new Date(NOW_MS + 90_000).toISOString(),
    });
    expect(body.error.recovery).toEqual([
      { action: 'upgrade', href: '/pricing' },
      { action: 'byok', href: '/byok' },
    ]);
  });

  it('omits the retry hint when nothing is known to recover', async () => {
    const response = buildFreeCapacityUnavailableResponse(
      { status: 'free_capacity_unavailable', rejected: [] },
      NOW_MS,
    );
    expect(response.headers.get('Retry-After')).toBeNull();
    const body = await response.json();
    expect(body.error.retry_at).toBeUndefined();
    expect(body.error.recovery).toHaveLength(2);
  });
});

describe('stage re-entry', () => {
  it('hands back the next zero-cost route with the failed one excluded', async () => {
    const result = await outcome(FREE_LANE_MODES.strict);
    if (result.kind !== 'dispatch') throw new Error('expected a dispatch');

    const next = nextFreeLaneRoute(result.plan, [result.plan.dispatchedRouteId], NOW_MS);
    expect(next?.routeId).toBe(BIG_ROUTE);
  });

  it('never hands back a route that already failed', async () => {
    const result = await outcome(FREE_LANE_MODES.strict);
    if (result.kind !== 'dispatch') throw new Error('expected a dispatch');

    expect(nextFreeLaneRoute(result.plan, [FAST_ROUTE, BIG_ROUTE], NOW_MS)).toBeNull();
  });

  it('never hands back the paid candidate once the free routes are spent', async () => {
    const result = await outcome(FREE_LANE_MODES.strict);
    if (result.kind !== 'dispatch') throw new Error('expected a dispatch');

    const exhausted = [FAST_ROUTE, BIG_ROUTE];
    expect(nextFreeLaneRoute(result.plan, exhausted, NOW_MS)).toBeNull();
    expect(result.plan.candidates.map((candidate) => candidate.routeId)).toContain(PAID_ROUTE);
  });
});

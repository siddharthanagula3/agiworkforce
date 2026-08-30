/**
 * Free Auto safety suite.
 *
 * The governing invariant under test: Free Auto never returns a route it has not
 * positively verified as zero incremental cost, and never falls through to paid
 * inference under ANY failure condition. Every uncertainty must resolve to
 * ineligible.
 */
import { describe, expect, it } from 'vitest';

import { resolveFreeAutoRoute, type FreeAutoCandidate } from '../free-auto';
import type { FreeEligibility, QuotaPool, RoutingRuntimeState } from '../runtime-state';

const NOW = 1_800_000_000_000;

function candidate(routeId: string, provider = 'google'): FreeAutoCandidate {
  return { routeId, modelKey: `${routeId}-model`, provider, harnessId: `${provider}/chat` };
}

function goodTerms(): FreeEligibility['terms'] {
  return {
    commercialUseAllowed: true,
    thirdPartyServingAllowed: true,
    proxyingAllowed: true,
    promptsExcludedFromTraining: true,
  };
}

function eligibility(routeId: string, poolId: string, over: Partial<FreeEligibility> = {}) {
  return {
    routeId,
    quotaPoolId: poolId,
    terms: goodTerms(),
    verifiedAtMs: NOW - 1_000,
    verificationSource: 'test',
    ...over,
  } satisfies FreeEligibility;
}

function pool(id: string, over: Partial<QuotaPool> = {}): QuotaPool {
  return {
    id,
    routeIds: [],
    headroomFraction: 0.5,
    hardStopsBeforePaid: true,
    ...over,
  };
}

function state(over: Partial<RoutingRuntimeState> = {}): RoutingRuntimeState {
  return {
    routeHealth: {},
    providerHealth: {},
    quotaPools: {},
    freeEligibility: {},
    capturedAtMs: NOW,
    ...over,
  };
}

describe('strict zero-cost gate', () => {
  it('refuses a route with no verified free record — the default answer', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state(),
      nowMs: NOW,
    });

    expect(decision.status).toBe('free_capacity_unavailable');
    expect(decision.rejected[0]).toMatchObject({ routeId: 'r1', reason: 'not_verified_free' });
  });

  it('never infers eligibility from a zero price — a paid meta-router priced at 0 stays out', () => {
    // `openrouter-auto` is priced 0 in the catalog because its price is unknowable
    // at compile time, not because it is free. With no eligibility record it must
    // be refused no matter what the catalog says.
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('open_router/openrouter-auto', 'open_router')],
      state: state({ quotaPools: { p: pool('p') } }),
      nowMs: NOW,
    });
    expect(decision.status).toBe('free_capacity_unavailable');
  });

  it('refuses an expired verification', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({
        freeEligibility: { r1: eligibility('r1', 'p', { expiresAtMs: NOW - 1 }) },
        quotaPools: { p: pool('p') },
      }),
      nowMs: NOW,
    });
    expect(decision.rejected[0]?.reason).toBe('verification_expired');
  });

  it.each([
    ['commercialUseAllowed', { commercialUseAllowed: false }],
    ['thirdPartyServingAllowed', { thirdPartyServingAllowed: false }],
    ['proxyingAllowed', { proxyingAllowed: false }],
    ['promptsExcludedFromTraining', { promptsExcludedFromTraining: false }],
  ])('refuses when %s is false', (_label, override) => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({
        freeEligibility: {
          r1: eligibility('r1', 'p', { terms: { ...goodTerms(), ...override } }),
        },
        quotaPools: { p: pool('p') },
      }),
      nowMs: NOW,
    });
    expect(decision.rejected[0]?.reason).toBe('terms_incompatible');
  });

  it('refuses a pool that bills past its allowance instead of hard-stopping', () => {
    // This is the leak that would turn "free" into "cheap": a pool with no hard
    // stop silently becomes paid inference the moment the allowance runs out.
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({
        freeEligibility: { r1: eligibility('r1', 'p') },
        quotaPools: { p: pool('p', { hardStopsBeforePaid: false }) },
      }),
      nowMs: NOW,
    });
    expect(decision.rejected[0]?.reason).toBe('no_hard_stop_before_paid');
  });

  it('refuses when the quota pool is unknown to the snapshot', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({ freeEligibility: { r1: eligibility('r1', 'missing-pool') } }),
      nowMs: NOW,
    });
    expect(decision.rejected[0]?.reason).toBe('quota_pool_unknown');
  });
});

describe('shared quota pools', () => {
  it('exhausting a shared pool removes EVERY route drawing on it', () => {
    const shared = { r1: eligibility('r1', 'shared'), r2: eligibility('r2', 'shared') };
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1'), candidate('r2')],
      state: state({
        freeEligibility: shared,
        quotaPools: { shared: pool('shared', { headroomFraction: 0, resetsAtMs: NOW + 60_000 }) },
      }),
      nowMs: NOW,
    });

    expect(decision.status).toBe('free_capacity_unavailable');
    expect(decision.rejected.map((r) => r.reason)).toEqual(['quota_exhausted', 'quota_exhausted']);
  });

  it('surfaces the reset time so a caller can say when capacity returns', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({
        freeEligibility: { r1: eligibility('r1', 'p') },
        quotaPools: { p: pool('p', { headroomFraction: 0, resetsAtMs: NOW + 30_000 }) },
      }),
      nowMs: NOW,
    });
    expect(decision.status).toBe('free_capacity_unavailable');
    if (decision.status === 'free_capacity_unavailable') {
      expect(decision.earliestRetryAtMs).toBe(NOW + 30_000);
    }
  });

  it('prefers the pool with the most headroom rather than draining one to zero', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('low', 'a'), candidate('high', 'b')],
      state: state({
        freeEligibility: { low: eligibility('low', 'pLow'), high: eligibility('high', 'pHigh') },
        quotaPools: {
          pLow: pool('pLow', { headroomFraction: 0.1 }),
          pHigh: pool('pHigh', { headroomFraction: 0.9 }),
        },
      }),
      nowMs: NOW,
    });

    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(decision.ranked[0]?.routeId).toBe('high');
    }
  });
});

describe('health gating and failure re-entry', () => {
  it('refuses an unhealthy route and reports when it may recover', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({
        freeEligibility: { r1: eligibility('r1', 'p') },
        quotaPools: { p: pool('p') },
        routeHealth: {
          r1: { available: false, reason: 'rate_limited', availableAtMs: NOW + 5_000 },
        },
      }),
      nowMs: NOW,
    });
    expect(decision.rejected[0]).toMatchObject({ reason: 'unhealthy', retryAtMs: NOW + 5_000 });
  });

  it('does not offer a retry time for an operator-cleared failure', () => {
    // Billing exhaustion does not heal on its own; suggesting a retry time would
    // be a lie that produces a polling loop.
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1')],
      state: state({
        freeEligibility: { r1: eligibility('r1', 'p') },
        quotaPools: { p: pool('p') },
        routeHealth: {
          r1: { available: false, reason: 'billing_exhausted', availableAtMs: NOW + 5_000 },
        },
      }),
      nowMs: NOW,
    });
    expect(decision.rejected[0]?.retryAtMs).toBeUndefined();
  });

  it('provider-level unavailability overrides a stale healthy route entry', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('r1', 'google')],
      state: state({
        freeEligibility: { r1: eligibility('r1', 'p') },
        quotaPools: { p: pool('p') },
        routeHealth: { r1: { available: true } },
        providerHealth: { google: { available: false, reason: 'provider_unhealthy' } },
      }),
      nowMs: NOW,
    });
    expect(decision.status).toBe('free_capacity_unavailable');
  });

  it('excludes a route that already failed in this request, and picks the next $0 route', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('first', 'a'), candidate('second', 'b')],
      state: state({
        freeEligibility: {
          first: eligibility('first', 'p1'),
          second: eligibility('second', 'p2'),
        },
        quotaPools: { p1: pool('p1'), p2: pool('p2') },
      }),
      nowMs: NOW,
      excludeRouteIds: ['first'],
    });

    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      expect(decision.ranked.map((c) => c.routeId)).toEqual(['second']);
    }
  });
});

describe('the invariant: never any paid route', () => {
  it('returns free_capacity_unavailable rather than a paid candidate when nothing is free', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('paid-1', 'openai'), candidate('paid-2', 'anthropic')],
      state: state(),
      nowMs: NOW,
    });

    expect(decision.status).toBe('free_capacity_unavailable');
    // There is no shape in which an unverified route reaches `ranked`.
    expect('ranked' in decision).toBe(false);
  });

  it('every returned route has a valid, unexpired, hard-stopping free record', () => {
    const decision = resolveFreeAutoRoute({
      candidates: [candidate('free-1', 'a'), candidate('paid-1', 'openai')],
      state: state({
        freeEligibility: { 'free-1': eligibility('free-1', 'p') },
        quotaPools: { p: pool('p') },
      }),
      nowMs: NOW,
    });

    expect(decision.status).toBe('selected');
    if (decision.status === 'selected') {
      for (const route of decision.ranked) {
        expect(route.routeId).toBe('free-1');
      }
      expect(decision.ranked.some((r) => r.routeId === 'paid-1')).toBe(false);
    }
  });

  it('an empty candidate set is unavailable, not an error and not a fallthrough', () => {
    const decision = resolveFreeAutoRoute({ candidates: [], state: state(), nowMs: NOW });
    expect(decision.status).toBe('free_capacity_unavailable');
  });
});

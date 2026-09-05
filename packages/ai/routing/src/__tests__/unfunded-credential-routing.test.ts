import { modelRegistry } from '@agiworkforce/model-registry';
import { describe, expect, it } from 'vitest';

import {
  observedRouteHealthFromSnapshots,
  resolveAutoRoute,
  type ObservedRouteHealth,
  type RoutingTrustMode,
} from '../auto';
import type { RoutingTaskType } from '../types';
import type { RouteHealthSnapshot } from '../runtime-state';

const TRUST_MODE: RoutingTrustMode = 'byok';
const UNFUNDED: ObservedRouteHealth = { credentialUnfunded: true };

const ALIASES = Object.keys(modelRegistry.policies.auto.aliases);
const TASKS = Object.keys(modelRegistry.policies.auto.tasks) as RoutingTaskType[];
const TIERS = Object.keys(modelRegistry.policies.auto.tierMaximumProfiles);

const EXHAUSTION_LOOP_CEILING = 200;

interface MovedCase {
  request: Parameters<typeof resolveAutoRoute>[0];
  baseRouteId: string;
  fundedRouteId: string;
}

/**
 * The registry decides which selection has a second dispatchable route, so
 * nothing here names a model, an alias, a provider or a tier.
 */
function firstCaseThatMoves(): MovedCase | undefined {
  for (const selection of ALIASES) {
    for (const taskType of TASKS) {
      for (const subscriptionTier of TIERS) {
        const request = {
          selection,
          taskType,
          subscriptionTier,
          trustMode: TRUST_MODE,
          enableTaskFamilyStage: false,
        } as const;
        const base = resolveAutoRoute(request);
        if (base.status !== 'selected') continue;
        const moved = resolveAutoRoute({
          ...request,
          observedRouteHealth: { [base.routeId]: UNFUNDED },
        });
        if (moved.status !== 'selected' || moved.routeId === base.routeId) continue;
        return { request, baseRouteId: base.routeId, fundedRouteId: moved.routeId };
      }
    }
  }
  return undefined;
}

const moved = firstCaseThatMoves();

describe('an unfunded credential is unselectable for a new auto request', () => {
  it('has at least one selection whose route the resolver can move off', () => {
    expect(moved).toBeDefined();
  });

  it('moves off the unfunded route to one that can still be paid for', () => {
    if (!moved) return;
    expect(moved.fundedRouteId).not.toBe(moved.baseRouteId);
  });

  it('parks the route rather than refusing the request when every credential is unfunded', () => {
    if (!moved) return;
    // Walk the ladder, condemning whatever the resolver picks, until it has no
    // funded route left anywhere. The request must still be served: the point
    // is to prefer a funded route, not to strand a user because our own
    // accounts are empty. The one rotation managed failover allows is what
    // handles the refusal if the parked route does turn it down.
    const unfunded: Record<string, ObservedRouteHealth> = {};
    let selectedRouteId: string | undefined;
    for (let attempt = 0; attempt < EXHAUSTION_LOOP_CEILING; attempt += 1) {
      const decision = resolveAutoRoute({ ...moved.request, observedRouteHealth: unfunded });
      expect(decision.status).toBe('selected');
      if (decision.status !== 'selected') return;
      if (unfunded[decision.routeId]) {
        selectedRouteId = decision.routeId;
        break;
      }
      unfunded[decision.routeId] = UNFUNDED;
    }
    expect(selectedRouteId).toBeDefined();
  });

  it('parks it with observed-health ranking explicitly off, because this is a fact and not a band', () => {
    if (!moved) return;
    const decision = resolveAutoRoute({
      ...moved.request,
      enableObservedHealthRanking: false,
      observedRouteHealth: { [moved.baseRouteId]: UNFUNDED },
    });

    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.routeId).not.toBe(moved.baseRouteId);
  });

  it('leaves selection alone when the same route is merely slow and flaky', () => {
    if (!moved) return;
    const decision = resolveAutoRoute({
      ...moved.request,
      enableObservedHealthRanking: false,
      observedRouteHealth: { [moved.baseRouteId]: { failureRate: 1, latencyP50Ms: 60_000 } },
    });

    expect(decision.status).toBe('selected');
    if (decision.status !== 'selected') return;
    expect(decision.routeId).toBe(moved.baseRouteId);
  });
});

describe('building the observed input from the store', () => {
  const ROUTE_ID = 'provider-alpha/model-alpha';

  function snapshot(overrides: Partial<RouteHealthSnapshot> = {}): RouteHealthSnapshot {
    return {
      available: true,
      halfOpen: false,
      consecutiveFailures: 0,
      sampleCount: 4,
      successRate: 1,
      ...overrides,
    };
  }

  it('marks an unfunded route that has no route-scope samples at all', () => {
    // The sample-count filter drops a route nothing has measured, which is
    // right for the ranking bands and wrong here: an untried route on an empty
    // account is exactly as unable to serve as a heavily tried one.
    const observed = observedRouteHealthFromSnapshots(
      { [ROUTE_ID]: snapshot({ sampleCount: 0 }) },
      new Set([ROUTE_ID]),
    );

    expect(observed[ROUTE_ID]).toEqual({ credentialUnfunded: true });
  });

  it('keeps the measured bands alongside the unfunded flag', () => {
    const observed = observedRouteHealthFromSnapshots(
      { [ROUTE_ID]: snapshot({ successRate: 0.5, ttftP50Ms: 900 }) },
      new Set([ROUTE_ID]),
    );

    expect(observed[ROUTE_ID]).toEqual({
      failureRate: 0.5,
      latencyP50Ms: 900,
      credentialUnfunded: true,
    });
  });

  it('marks nothing when no credential is unfunded', () => {
    const observed = observedRouteHealthFromSnapshots({ [ROUTE_ID]: snapshot() });

    expect(observed[ROUTE_ID]?.credentialUnfunded).toBeUndefined();
  });
});

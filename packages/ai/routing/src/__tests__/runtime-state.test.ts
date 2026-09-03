import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import {
  effectiveRouteHealth,
  emptyRuntimeState,
  MAX_ROUTE_HEALTH_SNAPSHOT_AGE_MS,
  type RouteHealthSnapshot,
} from '../runtime-state';

const PROVIDER_ID = 'anthropic';
const ROUTE_ID = `${PROVIDER_ID}/${requireProviderDefaultModel(PROVIDER_ID)}`;

function snapshot(overrides: Partial<RouteHealthSnapshot> = {}): RouteHealthSnapshot {
  return {
    available: false,
    halfOpen: false,
    consecutiveFailures: 5,
    sampleCount: 5,
    cooldownUntilMs: Date.now() + 60_000,
    ...overrides,
  };
}

describe('effectiveRouteHealth · route health snapshots', () => {
  it('parks a route whose fresh snapshot is in cooldown', () => {
    const capturedAtMs = Date.now();
    const state = {
      ...emptyRuntimeState(capturedAtMs),
      routeHealthSnapshots: { [ROUTE_ID]: snapshot({ cooldownUntilMs: capturedAtMs + 60_000 }) },
    };

    const health = effectiveRouteHealth(state, ROUTE_ID, PROVIDER_ID);

    expect(health.available).toBe(false);
    expect(health.reason).toBe('circuit_open');
    expect(health.availableAtMs).toBe(capturedAtMs + 60_000);
  });

  it('treats a healthy fresh snapshot as available and carries its success rate', () => {
    const capturedAtMs = Date.now();
    const state = {
      ...emptyRuntimeState(capturedAtMs),
      routeHealthSnapshots: {
        [ROUTE_ID]: snapshot({ available: true, cooldownUntilMs: undefined, successRate: 0.92 }),
      },
    };

    const health = effectiveRouteHealth(state, ROUTE_ID, PROVIDER_ID);

    expect(health.available).toBe(true);
    expect(health.successRate).toBeCloseTo(0.92);
  });

  it('never pins a route unavailable from a snapshot older than the maximum age', () => {
    const capturedAtMs = Date.now() - (MAX_ROUTE_HEALTH_SNAPSHOT_AGE_MS + 1);
    const state = {
      ...emptyRuntimeState(capturedAtMs),
      routeHealthSnapshots: { [ROUTE_ID]: snapshot() },
    };

    const health = effectiveRouteHealth(state, ROUTE_ID, PROVIDER_ID);

    expect(health.available).toBe(true);
  });

  it('reports no signal, not unhealthy, when the route has no snapshot entry', () => {
    const state = emptyRuntimeState(Date.now());

    const health = effectiveRouteHealth(state, ROUTE_ID, PROVIDER_ID);

    expect(health.available).toBe(true);
    expect(health.reason).toBeUndefined();
  });

  it('lets an unavailable provider-level entry win over a healthy snapshot', () => {
    const capturedAtMs = Date.now();
    const state = {
      ...emptyRuntimeState(capturedAtMs),
      providerHealth: { [PROVIDER_ID]: { available: false, reason: 'billing_exhausted' as const } },
      routeHealthSnapshots: {
        [ROUTE_ID]: snapshot({ available: true, cooldownUntilMs: undefined }),
      },
    };

    const health = effectiveRouteHealth(state, ROUTE_ID, PROVIDER_ID);

    expect(health.available).toBe(false);
    expect(health.reason).toBe('billing_exhausted');
  });
});

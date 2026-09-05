import { afterEach, describe, expect, it } from 'vitest';

import {
  observedHealthRankingEnabled,
  observedRouteHealthFromSnapshots,
  observedRoutePenalty,
  OBSERVED_HEALTH_ENV,
} from '../auto';
import type { RouteHealthSnapshot } from '../runtime-state';

const ROUTE_ID = 'provider-alpha/model-alpha';

function snapshot(overrides: Partial<RouteHealthSnapshot> = {}): RouteHealthSnapshot {
  return {
    available: true,
    halfOpen: false,
    consecutiveFailures: 0,
    sampleCount: 10,
    ...overrides,
  };
}

afterEach(() => {
  delete process.env[OBSERVED_HEALTH_ENV];
});

describe('observed-health flag', () => {
  it('is off unless the documented env name is set', () => {
    expect(observedHealthRankingEnabled()).toBe(false);
  });

  it('is on for the enabled value only', () => {
    process.env[OBSERVED_HEALTH_ENV] = '1';
    expect(observedHealthRankingEnabled()).toBe(true);
    process.env[OBSERVED_HEALTH_ENV] = 'true';
    expect(observedHealthRankingEnabled()).toBe(false);
  });
});

describe('observed route penalty', () => {
  it('is zero while the flag is off, whatever was observed', () => {
    expect(observedRoutePenalty({ failureRate: 1, latencyP50Ms: 60_000 }, false)).toBe(0);
  });

  it('is zero for a route nothing has been observed about', () => {
    expect(observedRoutePenalty(undefined, true)).toBe(0);
  });

  it('is zero for a route that has never failed and answers promptly', () => {
    expect(observedRoutePenalty({ failureRate: 0, latencyP50Ms: 120 }, true)).toBe(0);
  });

  it('ranks a failing route behind a healthy one', () => {
    const failing = observedRoutePenalty({ failureRate: 0.8 }, true);
    const healthy = observedRoutePenalty({ failureRate: 0.05 }, true);
    expect(failing).toBeGreaterThan(healthy);
  });

  it('ranks a slow route behind a fast one at the same failure rate', () => {
    const slow = observedRoutePenalty({ failureRate: 0, latencyP50Ms: 3_500 }, true);
    const fast = observedRoutePenalty({ failureRate: 0, latencyP50Ms: 200 }, true);
    expect(slow).toBeGreaterThan(fast);
  });

  it('weighs failure above latency, so a fast broken route loses to a slow working one', () => {
    const fastAndBroken = observedRoutePenalty({ failureRate: 0.9, latencyP50Ms: 50 }, true);
    const slowAndWorking = observedRoutePenalty({ failureRate: 0, latencyP50Ms: 60_000 }, true);
    expect(fastAndBroken).toBeGreaterThan(slowAndWorking);
  });

  it('does not move on sampling noise inside one band', () => {
    expect(observedRoutePenalty({ failureRate: 0.02 }, true)).toBe(
      observedRoutePenalty({ failureRate: 0.2 }, true),
    );
  });
});

describe('snapshots as ranking inputs', () => {
  it('reports the complement of the success rate as the failure rate', () => {
    const observed = observedRouteHealthFromSnapshots({
      [ROUTE_ID]: snapshot({ successRate: 0.25, ttftP50Ms: 800 }),
    });
    expect(observed[ROUTE_ID]).toEqual({ failureRate: 0.75, latencyP50Ms: 800 });
  });

  it('keeps a route with no samples out, so never tried is not never failed', () => {
    expect(observedRouteHealthFromSnapshots({ [ROUTE_ID]: snapshot({ sampleCount: 0 }) })).toEqual(
      {},
    );
  });

  it('returns nothing when the store gave no snapshots', () => {
    expect(observedRouteHealthFromSnapshots(undefined)).toEqual({});
  });
});

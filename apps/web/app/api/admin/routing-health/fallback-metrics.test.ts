import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { RouteScopeHealthRow } from '@/features/admin/services/routing-health-metrics';

import { fleetReliability, withFallbackReadings } from './fallback-metrics';

const CONFIG = { reliabilityFloor: 0.9, minSamples: 10 };

function row(
  routeId: string,
  sampleCount: number,
  successRate: number | null,
): RouteScopeHealthRow {
  return {
    routeId,
    provider: routeId.split('/')[0] ?? routeId,
    modelKey: routeId.split('/')[1] ?? routeId,
    state: 'closed',
    observations: {
      sampleCount,
      consecutiveFailures: 0,
      successRate,
      rateLimitRate: null,
      serverErrorRate: null,
      timeoutRate: null,
      streamCorruptionRate: null,
      ttftP50Ms: null,
      throughputTokensPerSecond: null,
      cooldownUntil: null,
    },
  };
}

describe('the routing-health fallback metric', () => {
  it('reports a fallback rate per route, and names the ones under the floor', () => {
    const rows = withFallbackReadings(
      [row('openai/a', 40, 0.7), row('openai/b', 40, 0.99), row('openai/c', 0, null)],
      CONFIG,
    );

    expect(rows[0]?.fallback.fallbackRate).toBeCloseTo(0.3);
    expect(rows[0]?.fallback.belowReliabilityFloor).toBe(true);
    expect(rows[1]?.fallback.belowReliabilityFloor).toBe(false);
    expect(rows[2]?.fallback.fallbackRate).toBeNull();
  });

  it('weights the fleet rate by samples, so an idle route cannot move it', () => {
    const reliability = fleetReliability(
      withFallbackReadings([row('openai/a', 100, 0.85), row('openai/b', 1, 0)], CONFIG),
      CONFIG,
    );

    expect(reliability.observedRoutes).toBe(2);
    expect(reliability.fallbackRate).toBeCloseTo((0.15 * 100 + 1 * 1) / 101);
    expect(reliability.routesBelowFloor).toEqual(['openai/a']);
  });

  it('reports no fleet rate at all when nothing has been observed', () => {
    const reliability = fleetReliability(
      withFallbackReadings([row('openai/a', 0, null)], CONFIG),
      CONFIG,
    );

    expect(reliability.fallbackRate).toBeNull();
    expect(reliability.routesBelowFloor).toEqual([]);
  });
});

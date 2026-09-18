import 'server-only';

import {
  resolveRouteReliabilityConfig,
  routeFallbackReading,
  type RouteFallbackReading,
  type RouteReliabilityConfig,
} from '@agiworkforce/routing';

import type {
  ProviderHealthRow,
  RouteScopeHealthRow,
} from '@/features/admin/services/routing-health-metrics';

/**
 * The metric above the per-route breaker: how often a route hands its turns to
 * another one. A breaker says a route is parked; this says a route is quietly
 * losing, which is what a failover that keeps answering looks like from outside.
 */

export interface RouteFallbackRow extends RouteScopeHealthRow {
  fallback: RouteFallbackReading;
}

export interface FleetReliability {
  reliabilityFloor: number;
  minSamples: number;
  observedRoutes: number;
  /** Sample-weighted, so one idle route cannot move the fleet number. */
  fallbackRate: number | null;
  routesBelowFloor: string[];
}

export function withFallbackReadings(
  rows: readonly RouteScopeHealthRow[],
  config: RouteReliabilityConfig = resolveRouteReliabilityConfig(),
): RouteFallbackRow[] {
  return rows.map((row) => ({ ...row, fallback: routeFallbackReading(row.observations, config) }));
}

export function fleetReliability(
  rows: readonly RouteFallbackRow[],
  config: RouteReliabilityConfig = resolveRouteReliabilityConfig(),
): FleetReliability {
  const observed = rows.filter((row) => row.fallback.fallbackRate !== null);
  const samples = observed.reduce((total, row) => total + row.fallback.sampleCount, 0);
  const weighted = observed.reduce(
    (total, row) => total + (row.fallback.fallbackRate ?? 0) * row.fallback.sampleCount,
    0,
  );
  return {
    reliabilityFloor: config.reliabilityFloor,
    minSamples: config.minSamples,
    observedRoutes: observed.length,
    fallbackRate: samples > 0 ? weighted / samples : null,
    routesBelowFloor: observed
      .filter((row) => row.fallback.belowReliabilityFloor)
      .map((row) => row.routeId),
  };
}

export interface ProviderFallbackRow extends ProviderHealthRow {
  providerFallback: RouteFallbackReading;
  credentialFallback: RouteFallbackReading;
}

export function withProviderFallbackReadings(
  rows: readonly ProviderHealthRow[],
  config: RouteReliabilityConfig = resolveRouteReliabilityConfig(),
): ProviderFallbackRow[] {
  return rows.map((row) => ({
    ...row,
    providerFallback: routeFallbackReading(row.providerObservations, config),
    credentialFallback: routeFallbackReading(row.credentialObservations, config),
  }));
}

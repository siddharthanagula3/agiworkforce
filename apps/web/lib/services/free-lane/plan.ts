import {
  resolveFreeAutoRoute,
  type AutoFallbackRoute,
  type FreeAutoCandidate,
  type RoutingRuntimeState,
  type SelectedAutoRoute,
} from '@agiworkforce/routing';

import type { FreeLaneMode } from './mode';

export const ROUTE_LANE_HEADER = 'X-AGI-Route-Lane';

export const ROUTE_LANES = {
  free: 'free',
  managed: 'managed',
} as const;

export type RouteLane = (typeof ROUTE_LANES)[keyof typeof ROUTE_LANES];

/**
 * What a free-lane request carries so failover can re-enter the stage.
 *
 * The snapshot travels with the request rather than being re-read per attempt:
 * `runtime-state.ts` asks callers to take one view and hand it to every stage,
 * and it is what keeps re-entry synchronous inside the failover plan.
 */
export interface FreeLanePlan {
  mode: FreeLaneMode;
  candidates: readonly FreeAutoCandidate[];
  state: RoutingRuntimeState;
  routesByRouteId: ReadonlyMap<string, AutoFallbackRoute>;
  dispatchedRouteId: string;
}

/**
 * Names the lane that served, and only when one did.
 *
 * Absent on every other response by design: `off` must be byte-identical to
 * today, and a header asserting `managed` on traffic that never consulted the
 * lane would be a new claim, not a disclosure.
 */
export function addRouteLaneHeader(
  headers: Record<string, string>,
  request: { routeLane?: RouteLane },
): void {
  if (request.routeLane) headers[ROUTE_LANE_HEADER] = request.routeLane;
}

export function toFreeAutoCandidate(route: AutoFallbackRoute): FreeAutoCandidate {
  return {
    routeId: route.routeId,
    modelKey: route.modelKey,
    provider: route.provider,
    harnessId: route.harnessId,
  };
}

export function routesOf(decision: SelectedAutoRoute): AutoFallbackRoute[] {
  return [
    {
      modelKey: decision.modelKey,
      provider: decision.provider,
      providerModelId: decision.providerModelId,
      routeId: decision.routeId,
      harnessId: decision.harnessId,
    },
    ...decision.fallbacks,
  ];
}

export function withRankedHead(
  decision: SelectedAutoRoute,
  ranked: readonly FreeAutoCandidate[],
  routesByRouteId: ReadonlyMap<string, AutoFallbackRoute>,
): SelectedAutoRoute | null {
  const routes = ranked
    .map((candidate) => routesByRouteId.get(candidate.routeId))
    .filter((route): route is AutoFallbackRoute => route !== undefined);
  const [head, ...tail] = routes;
  if (!head) return null;
  return { ...decision, ...head, fallbacks: tail };
}

/**
 * Re-enter the stage after a free dispatch failed.
 *
 * Pure and synchronous by construction: the snapshot was taken once for this
 * request, so picking the next eligible zero-cost route needs no I/O and can run
 * inside the failover plan's `next()`, which has no place to await.
 */
export function nextFreeLaneRoute(
  plan: FreeLanePlan,
  excludeRouteIds: readonly string[],
  nowMs: number,
): AutoFallbackRoute | null {
  const decision = resolveFreeAutoRoute({
    candidates: plan.candidates,
    state: plan.state,
    nowMs,
    excludeRouteIds,
  });
  if (decision.status !== 'selected') return null;
  const head = decision.ranked[0];
  return head ? (plan.routesByRouteId.get(head.routeId) ?? null) : null;
}

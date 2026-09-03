/**
 * Why a route is not currently able to serve.
 *
 * These mirror the failure classes in `@agiworkforce/provider-runtime`'s
 * `ErrorCategory` deliberately: the thing that TOOK a route out of service is
 * the thing that decides when it may come back.
 */
export type RouteUnavailabilityReason =
  /** Short back-pressure. Comes back on its own, usually within seconds. */
  | 'rate_limited'
  /** The quota WINDOW is spent. Comes back only at `resetsAt`. */
  | 'quota_exhausted'
  /** The upstream account is out of money. Does NOT come back without an operator. */
  | 'billing_exhausted'
  /** Credential rejected. Does not come back without an operator. */
  | 'credential_invalid'
  /** Provider-side overload or 5xx. Comes back on its own. */
  | 'provider_unhealthy'
  /** Too many recent failures; deliberately parked. */
  | 'circuit_open'
  /** The model is gone from the provider. */
  | 'model_unavailable';

/**
 * Whether a reason can clear without human intervention.
 *
 * Free Auto uses this to decide whether a route is worth reconsidering later in
 * the same request. An operator-cleared reason (no money, bad key) must never be
 * retried in a loop.
 */
export function isSelfHealingReason(reason: RouteUnavailabilityReason): boolean {
  return (
    reason === 'rate_limited' ||
    reason === 'quota_exhausted' ||
    reason === 'provider_unhealthy' ||
    reason === 'circuit_open'
  );
}

/** Live health for one provider, or one route within it. */
export interface RouteHealth {
  /** `false` means do not dispatch here right now. */
  available: boolean;
  reason?: RouteUnavailabilityReason;
  /** Epoch ms at which `available` may flip back. Absent = unknown. */
  availableAtMs?: number;
  /** Rolling success rate in [0,1] over the store's window. */
  successRate?: number;
  /** Rolling median latency in ms. */
  latencyP50Ms?: number;
  /** Consecutive failures observed since the last success. */
  consecutiveFailures?: number;
}

export interface QuotaPool {
  id: string;
  /** Route ids that draw on this pool. */
  routeIds: readonly string[];
  headroomFraction: number;
  /** Epoch ms when the window resets. Absent = unknown/rolling. */
  resetsAtMs?: number;
  /**
   * Whether the provider hard-stops at the limit instead of billing overage.
   *
   * Free Auto REQUIRES this to be `true`. A pool that silently bills past its
   * free allowance is not free capacity, and treating it as such is precisely
   * how a zero-cost mode leaks into paid inference.
   */
  hardStopsBeforePaid: boolean;
  /** Observed spend rate as a fraction of the window per hour, if known. */
  burnRatePerHour?: number;
}

export interface FreeEligibility {
  /** The route this record vouches for. */
  routeId: string;
  /** Pool whose headroom this route consumes. */
  quotaPoolId: string;
  /**
   * Every one of these must be true for the route to be eligible. They are
   * separate fields rather than a single boolean so an ineligible route can say
   * WHY, and so a partially-verified provider fails closed on the missing part
   * rather than being waved through.
   */
  terms: {
    /** The free tier permits commercial use. */
    commercialUseAllowed: boolean;
    /** The free tier permits serving third-party end users (not personal-use-only). */
    thirdPartyServingAllowed: boolean;
    /** The free tier does not forbid proxying/reselling. */
    proxyingAllowed: boolean;
    /** Prompts are not used for provider training. */
    promptsExcludedFromTraining: boolean;
  };
  /** Who established the above, and when. Stale verification is not verification. */
  verifiedAtMs: number;
  verificationSource: string;
  /** Epoch ms after which this record must be re-verified before use. */
  expiresAtMs?: number;
}

export type RouteOutcomeClass =
  | 'success'
  | 'rate_limit'
  | 'server_error'
  | 'timeout'
  | 'stream_corruption'
  | 'unsupported_capability';

export interface RouteOutcome {
  class: RouteOutcomeClass;
  ttftMs?: number;
  durationMs?: number;
  outputTokens?: number;
}

export interface RouteHealthSnapshot {
  available: boolean;
  halfOpen: boolean;
  cooldownUntilMs?: number;
  consecutiveFailures: number;
  sampleCount: number;
  successRate?: number;
  rateLimitRate?: number;
  serverErrorRate?: number;
  timeoutRate?: number;
  streamCorruptionRate?: number;
  ttftP50Ms?: number;
  ttftP95Ms?: number;
  throughputTokensPerSecond?: number;
}

export interface RoutingRuntimeState {
  /** Health by route id. A missing entry means "no signal", not "unhealthy". */
  routeHealth: Readonly<Record<string, RouteHealth>>;
  /** Health by provider id, applied to every route on that provider. */
  providerHealth: Readonly<Record<string, RouteHealth>>;
  /** Quota pools by id. */
  quotaPools: Readonly<Record<string, QuotaPool>>;
  /** Verified zero-cost eligibility by route id. Absence ⇒ not free. */
  freeEligibility: Readonly<Record<string, FreeEligibility>>;
  routeHealthSnapshots?: Readonly<Record<string, RouteHealthSnapshot>>;
  /** Epoch ms this snapshot was taken, for staleness decisions. */
  capturedAtMs: number;
}

/** An empty snapshot: no signal about anything. */
export function emptyRuntimeState(capturedAtMs: number): RoutingRuntimeState {
  return {
    routeHealth: {},
    providerHealth: {},
    quotaPools: {},
    freeEligibility: {},
    capturedAtMs,
  };
}

export const MAX_ROUTE_HEALTH_SNAPSHOT_AGE_MS = 30_000;

function freshRouteHealthSnapshot(
  state: RoutingRuntimeState,
  routeId: string,
): RouteHealthSnapshot | undefined {
  const snapshot = state.routeHealthSnapshots?.[routeId];
  if (!snapshot) return undefined;
  const ageMs = Date.now() - state.capturedAtMs;
  return ageMs >= 0 && ageMs <= MAX_ROUTE_HEALTH_SNAPSHOT_AGE_MS ? snapshot : undefined;
}

export function effectiveRouteHealth(
  state: RoutingRuntimeState,
  routeId: string,
  providerId: string,
): RouteHealth {
  const provider = state.providerHealth[providerId];
  if (provider && !provider.available) return provider;
  const route = state.routeHealth[routeId];
  if (route && !route.available) return route;
  const snapshot = freshRouteHealthSnapshot(state, routeId);
  if (snapshot && !snapshot.available) {
    return {
      available: false,
      reason: 'circuit_open',
      ...(snapshot.cooldownUntilMs !== undefined
        ? { availableAtMs: snapshot.cooldownUntilMs }
        : {}),
      ...(snapshot.successRate !== undefined ? { successRate: snapshot.successRate } : {}),
    };
  }
  // Merge the observable metrics, preferring the more specific route-level value.
  return {
    available: true,
    ...(route?.successRate !== undefined
      ? { successRate: route.successRate }
      : snapshot?.successRate !== undefined
        ? { successRate: snapshot.successRate }
        : {}),
    ...(route?.latencyP50Ms !== undefined ? { latencyP50Ms: route.latencyP50Ms } : {}),
  };
}

/**
 * Whether a free-eligibility record may still be trusted.
 *
 * Fail closed on every uncertainty: a missing record, an expired one, or one
 * whose terms are not all satisfied is NOT eligible. Free-tier terms change
 * without any catalog change, which is why a verification timestamp is part of
 * the contract rather than an afterthought.
 */
export function isFreeEligibilityValid(
  eligibility: FreeEligibility | undefined,
  nowMs: number,
): boolean {
  if (!eligibility) return false;
  if (eligibility.expiresAtMs !== undefined && eligibility.expiresAtMs <= nowMs) return false;
  const { terms } = eligibility;
  return (
    terms.commercialUseAllowed &&
    terms.thirdPartyServingAllowed &&
    terms.proxyingAllowed &&
    terms.promptsExcludedFromTraining
  );
}

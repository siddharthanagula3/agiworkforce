/**
 * Dynamic routing state: the volatile half of a routing decision.
 *
 * WHY THIS IS A SEPARATE LAYER
 * ----------------------------
 * The model catalog is a build-time compiled artifact: it is drift-guarded,
 * mirrored into two Rust crates, and byte-comparable in CI. That is exactly what
 * you want for "which models exist and what are they allowed to do", and exactly
 * what you do NOT want for "is this provider healthy right now" or "how much of
 * this free quota is left". Volatile facts must never be written into the
 * catalog, or the drift guards become noise and the Rust mirrors become
 * unreproducible.
 *
 * So: the catalog answers WHAT MAY be routed to. This module answers WHAT IS
 * CURRENTLY ABLE to serve. `resolveAutoRoute` performs admission over the
 * former; the stages layered on top consult the latter.
 *
 * WHY IT IS PURE
 * --------------
 * Nothing here reads Redis, Postgres or the network. State is passed IN as a
 * snapshot. That keeps `packages/ai/routing` a pure, synchronous, trivially
 * testable library, the property that makes the 1,412-case conformance fixture
 * possible, and confines I/O to the surface that owns it (`apps/web`).
 *
 * It also means a serverless caller can fetch the snapshot once per request and
 * hand the same view to every stage, rather than each stage racing its own read.
 *
 * @module routing/runtime-state
 * @packageDocumentation
 */

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

/**
 * A pool of upstream capacity shared by one or more models.
 *
 * The registry models `provider -> model -> route`, which cannot express the
 * thing that actually constrains free capacity: several models drawing on ONE
 * upstream allowance tied to ONE credential. Treating each model as having
 * independent headroom is how a router exhausts a shared pool while believing it
 * has spread the load.
 *
 * `id` is opaque and assigned by the state provider, routing never constructs
 * or parses it, so a pool can be per-credential, per-project or per-region
 * without this layer knowing or caring.
 */
export interface QuotaPool {
  id: string;
  /** Route ids that draw on this pool. */
  routeIds: readonly string[];
  /**
   * Fraction of the window still available, in [0,1].
   *
   * Deliberately normalised rather than raw counts: pools meter in requests,
   * tokens, or credits, and a ranker that had to understand each unit would need
   * per-provider knowledge, exactly the hardcoding this design forbids.
   */
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

/**
 * Verified zero-incremental-cost eligibility for one route.
 *
 * Presence of this record is what makes a route Free-Auto-eligible. Absence
 * means ineligible, never "assume free because the price field is 0".
 *
 * That rule is not theoretical. Seven models in the current catalog price at
 * zero and at most one is actually free: the provider's automatic meta-router is
 * PAID even though its price is merely unknowable at compile time, and five video
 * models are zero only because the price fields are token-denominated and cannot
 * express per-second billing.
 */
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
  | 'unsupported_capability'
  /**
   * The credential was refused. Recorded against the CREDENTIAL scope, never
   * against a route: every route on that provider answers to the same key, and
   * an unfunded or rejected key is an account fact rather than a route fact.
   */
  | 'credential_rejected';

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

/**
 * Everything the stages need to know about the world right now.
 *
 * Assembled once per request by the calling surface and passed down. A stage
 * that wants something not in here must extend this type rather than reach for
 * I/O: that constraint is what keeps routing pure.
 */
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

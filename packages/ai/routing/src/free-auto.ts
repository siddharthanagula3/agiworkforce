/**
 * Free Auto: select the best route whose incremental cost to AGIWorkforce is $0.
 *
 * WHAT THIS IS, ARCHITECTURALLY
 * ----------------------------
 * A STAGE over the canonical resolver's output, not a router. It receives the
 * candidate set `resolveAutoRoute` already admitted (trust mode, runtime
 * profile, tier ceiling, lifecycle, harness allow-list, capability, context) and
 * may only REJECT and REORDER within it. It never widens admission, never
 * consults `tierAllowedSlots`, and never sees a trust mode.
 *
 * This is the same architectural slot `task-family-routing.ts` occupies, and it
 * is deliberate: adding a `free` alias to the registry would auto-expand the
 * 1,412-case TS/Rust conformance fixture by 220 cases per alias, which the Rust
 * resolver would then have to reproduce, impossible, because Free Auto depends
 * on live quota and health state that a pure function over static policy cannot
 * see. Staying a TypeScript-only stage keeps cross-language parity intact.
 *
 * HOW IT DIFFERS FROM THE TASK-FAMILY STAGE
 * -----------------------------------------
 * That stage is a PERMUTATION: same members, nothing dropped, because stranding
 * a request whose only route sat below a quality floor would be worse than
 * running it. Free Auto is a FILTER THAT MAY STRAND, and that is the whole
 * point. "No free capacity right now" is a correct, useful answer. Silently
 * spending money because nothing free was available is not.
 *
 * THE INVARIANT
 * -------------
 * Free Auto never returns a route it has not positively verified as zero
 * incremental cost. Not "cheap". Not "priced at zero in the catalog". Verified,
 * unexpired, terms-checked, hard-stopping before paid overage. Every uncertainty
 * resolves to ineligible.
 *
 * @module routing/free-auto
 * @packageDocumentation
 */

import {
  effectiveRouteHealth,
  isFreeEligibilityValid,
  isSelfHealingReason,
  type RoutingRuntimeState,
  type RouteUnavailabilityReason,
} from './runtime-state';

/** A candidate handed in by the caller, already admitted by `resolveAutoRoute`. */
export interface FreeAutoCandidate {
  routeId: string;
  modelKey: string;
  provider: string;
  harnessId: string;
}

/** Why a candidate was refused. Every rejection is attributable. */
export type FreeAutoRejectionReason =
  /** No verified zero-cost record at all. The default answer. */
  | 'not_verified_free'
  /** Verification expired; free-tier terms change without a catalog change. */
  | 'verification_expired'
  /** A terms check failed (commercial use, third-party serving, proxying, training). */
  | 'terms_incompatible'
  /** The pool bills past its allowance instead of hard-stopping. */
  | 'no_hard_stop_before_paid'
  /** The pool this route draws on is unknown to the state snapshot. */
  | 'quota_pool_unknown'
  /** The pool has no headroom left. */
  | 'quota_exhausted'
  /** The route or its provider is currently unhealthy. */
  | 'unhealthy'
  /** Rejected earlier in this same request (e.g. it just failed). */
  | 'excluded_by_caller';

export interface FreeAutoRejection {
  routeId: string;
  reason: FreeAutoRejectionReason;
  /** Set when the reason may clear on its own, so a caller can decide to wait. */
  retryAtMs?: number;
}

export interface FreeAutoSelection {
  status: 'selected';
  /** Ranked, best first. The head is the dispatch target; the tail is failover. */
  ranked: readonly FreeAutoCandidate[];
  rejected: readonly FreeAutoRejection[];
}

export interface FreeAutoUnavailable {
  status: 'free_capacity_unavailable';
  /**
   * Every candidate and why it was refused. This is a first-class result, not an
   * error: the caller must surface it truthfully rather than fall through to a
   * paid route.
   */
  rejected: readonly FreeAutoRejection[];
  /** Earliest epoch ms at which any refused candidate might recover, if any. */
  earliestRetryAtMs?: number;
}

export type FreeAutoDecision = FreeAutoSelection | FreeAutoUnavailable;

export interface FreeAutoRequest {
  /** Candidates already admitted by the canonical resolver. */
  candidates: readonly FreeAutoCandidate[];
  state: RoutingRuntimeState;
  nowMs: number;
  /**
   * Routes already tried and failed during THIS request.
   *
   * Free Auto is re-entered on failure to pick the next eligible $0 route, and
   * must not hand back one that already failed.
   */
  excludeRouteIds?: readonly string[];
  /**
   * Minimum pool headroom to consider a route usable, in [0,1].
   *
   * Above zero by default: a pool at 0.5% remaining will almost certainly fail
   * mid-request, and burning a round-trip to discover that is worse than moving
   * on. Set to 0 to use a pool to its last drop.
   */
  minHeadroomFraction?: number;
}

const DEFAULT_MIN_HEADROOM = 0.02;

/**
 * Rank surviving candidates.
 *
 * Ordering rationale, in priority order:
 *
 *  1. **Most headroom first.** Spreading load across pools is what keeps free
 *     capacity available at all. Draining one provider to zero before touching
 *     the next is the failure mode this explicitly avoids, it converts a
 *     transient shortage on one provider into a total outage.
 *  2. **Then health.** Among comparable headroom, prefer the route that has been
 *     succeeding.
 *  3. **Then latency.** A tie-break, not a driver.
 *
 * Cost is absent from the ranking on purpose: every survivor is $0 by
 * construction, so there is nothing to trade off. This is what makes Free Auto
 * simpler than economic Auto rather than a special case of it.
 */
function scoreCandidate(candidate: FreeAutoCandidate, request: FreeAutoRequest): number {
  const { state } = request;
  const eligibility = state.freeEligibility[candidate.routeId];
  const pool = eligibility ? state.quotaPools[eligibility.quotaPoolId] : undefined;
  const headroom = pool?.headroomFraction ?? 0;
  const health = effectiveRouteHealth(state, candidate.routeId, candidate.provider);

  const successRate = health.successRate ?? 1;
  // Normalise latency into [0,1] with a soft knee at 10s; unknown latency is
  // treated as neutral rather than penalised, so a route with no telemetry is
  // not permanently ranked last and can never accumulate any.
  const latency = health.latencyP50Ms;
  const latencyScore = latency === undefined ? 0.5 : Math.max(0, 1 - latency / 10_000);

  return headroom * 100 + successRate * 10 + latencyScore;
}

/**
 * Choose the best zero-cost route, or say plainly that there is none.
 *
 * Pure: no I/O, no clock read (`nowMs` is supplied), no hidden state.
 */
export function resolveFreeAutoRoute(request: FreeAutoRequest): FreeAutoDecision {
  const { candidates, state, nowMs } = request;
  const excluded = new Set(request.excludeRouteIds ?? []);
  const minHeadroom = request.minHeadroomFraction ?? DEFAULT_MIN_HEADROOM;

  const survivors: FreeAutoCandidate[] = [];
  const rejected: FreeAutoRejection[] = [];

  const refuse = (routeId: string, reason: FreeAutoRejectionReason, retryAtMs?: number): void => {
    rejected.push({ routeId, reason, ...(retryAtMs !== undefined ? { retryAtMs } : {}) });
  };

  for (const candidate of candidates) {
    if (excluded.has(candidate.routeId)) {
      refuse(candidate.routeId, 'excluded_by_caller');
      continue;
    }

    // ---- Gate 1: strict zero cost, positively asserted --------------------
    const eligibility = state.freeEligibility[candidate.routeId];
    if (!eligibility) {
      // The default answer for anything unverified. This is the gate that stops
      // a paid meta-router priced at 0 in the catalog from being treated as free.
      refuse(candidate.routeId, 'not_verified_free');
      continue;
    }
    if (eligibility.expiresAtMs !== undefined && eligibility.expiresAtMs <= nowMs) {
      refuse(candidate.routeId, 'verification_expired');
      continue;
    }
    if (!isFreeEligibilityValid(eligibility, nowMs)) {
      refuse(candidate.routeId, 'terms_incompatible');
      continue;
    }

    // ---- Gate 2: the pool must hard-stop rather than bill overage ----------
    const pool = state.quotaPools[eligibility.quotaPoolId];
    if (!pool) {
      refuse(candidate.routeId, 'quota_pool_unknown');
      continue;
    }
    if (!pool.hardStopsBeforePaid) {
      // A pool that bills past its allowance is not free capacity. Admitting it
      // is exactly how a zero-cost mode leaks into paid inference.
      refuse(candidate.routeId, 'no_hard_stop_before_paid');
      continue;
    }

    // ---- Gate 3: headroom --------------------------------------------------
    if (pool.headroomFraction <= minHeadroom) {
      refuse(candidate.routeId, 'quota_exhausted', pool.resetsAtMs);
      continue;
    }

    // ---- Gate 4: health ----------------------------------------------------
    const health = effectiveRouteHealth(state, candidate.routeId, candidate.provider);
    if (!health.available) {
      const reason: RouteUnavailabilityReason | undefined = health.reason;
      const retryAt =
        reason !== undefined && isSelfHealingReason(reason) ? health.availableAtMs : undefined;
      refuse(candidate.routeId, 'unhealthy', retryAt);
      continue;
    }

    survivors.push(candidate);
  }

  if (survivors.length === 0) {
    const retryTimes = rejected
      .map((entry) => entry.retryAtMs)
      .filter((value): value is number => typeof value === 'number');
    return {
      status: 'free_capacity_unavailable',
      rejected,
      ...(retryTimes.length > 0 ? { earliestRetryAtMs: Math.min(...retryTimes) } : {}),
    };
  }

  const ranked = [...survivors].sort(
    (left, right) => scoreCandidate(right, request) - scoreCandidate(left, request),
  );

  return { status: 'selected', ranked, rejected };
}

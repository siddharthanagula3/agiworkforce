import 'server-only';

import {
  resolveFreeAutoRoute,
  type FreeAutoDecision,
  type FreeAutoUnavailable,
  type SelectedAutoRoute,
} from '@agiworkforce/routing';
import { getSlotForModel } from '@agiworkforce/types';
import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { loadFreePools, type FreePoolsDocument } from '@/lib/server/free-pools';
import { UPGRADE_HREF } from '@/lib/services/managed-usage-request-service';

import {
  freeLaneDispatches,
  freeLaneModeFor,
  freeLaneObserves,
  freeLaneStrandsWhenUnavailable,
  type FreeLaneMode,
} from './mode';
import { routesOf, toFreeAutoCandidate, withRankedHead, type FreeLanePlan } from './plan';
import { getFreeLaneRuntimeState } from './runtime-state-service';

/**
 * The alias the lane resolves against.
 *
 * Not the caller's selection: a free-plan request arrives pinned to one
 * subsidized trial model, whose route plan is a single explicit entry with no
 * fallbacks, nothing for a stage that may only reject and reorder to work with.
 * Resolving the economy alias at the free tier is what makes
 * `tierAllowedSlots.free` and the free slots' `preferredSlots` position
 * load-bearing, and it is the same admission every other request gets.
 */
export const FREE_LANE_SELECTION = 'auto-economy';

/**
 * The slots the lane asks the resolver to consider first.
 *
 * Derived from the pool config rather than listed here, so the only slots that
 * can ever be preferred are the ones a pool record actually claims. Adding a
 * pool makes its slot preferrable; removing one takes the preference away, with
 * no second list to keep in step.
 *
 * An unverified pool still contributes its slot, and that is correct: the
 * preference decides what the stage gets to LOOK at, while
 * `resolveFreeAutoRoute` decides what may be served. An unverified route is
 * considered and then refused as `not_verified_free`, which is the honest
 * rejection rather than an invisible omission.
 */
export function freeLanePreferredSlots(
  document: FreePoolsDocument = loadFreePools(),
): readonly string[] {
  const slots = new Set<string>();
  for (const entry of document.entries) {
    const modelKey = entry.routeId.slice(entry.routeId.indexOf(ROUTE_ID_SEPARATOR) + 1);
    const slot = getSlotForModel(modelKey);
    if (slot) slots.add(slot);
  }
  return [...slots];
}

const FREE_CAPACITY_UNAVAILABLE_CODE = 'free_capacity_unavailable';
const FREE_CAPACITY_UNAVAILABLE_STATUS = 429;
const FREE_CAPACITY_UNAVAILABLE_TYPE = 'insufficient_quota';
const FREE_CAPACITY_UNAVAILABLE_MESSAGE =
  'No free capacity right now. Try again shortly, upgrade your plan, or use your own provider key.';
const RETRY_AFTER_HEADER = 'Retry-After';
const ROUTE_ID_SEPARATOR = '/';
const BYOK_HREF = '/byok';
const MS_PER_SECOND = 1_000;
const MIN_RETRY_AFTER_SECONDS = 1;

export interface FreeLaneRecoveryOption {
  action: 'upgrade' | 'byok';
  href: string;
}

const FREE_CAPACITY_RECOVERY: readonly FreeLaneRecoveryOption[] = Object.freeze([
  { action: 'upgrade', href: UPGRADE_HREF },
  { action: 'byok', href: BYOK_HREF },
]);

export interface FreeLaneActivation {
  mode: FreeLaneMode;
  /** Empty unless this exact request may carry the preference. */
  preferSlots: readonly string[];
}

/**
 * The single place that decides whether this request is on the lane, and the
 * only source of the slot preference.
 *
 * Mode and preference are computed together on purpose. The resolver cannot
 * defend itself here: `normalizeTier` folds `basic`, `hobby` and every
 * unrecognised or absent tier into the `free` ceiling, so at the resolver a
 * paying Basic request IS free-tier and the preference would move it. The
 * protection is entirely this gate, so it is one function with one test rather
 * than an expression repeated at a call site.
 *
 * `isFreePlan` must come from the exact-`free` check. It does not trim, so a
 * whitespace-padded tier reads as not-free and the lane stays off, the safe
 * direction for a value we could not parse.
 */
export function activateFreeLane(input: {
  configuredMode: FreeLaneMode;
  isFreePlan: boolean;
  document?: FreePoolsDocument;
}): FreeLaneActivation {
  const mode = freeLaneModeFor(input.configuredMode, input.isFreePlan);
  return {
    mode,
    preferSlots: freeLaneObserves(mode) ? freeLanePreferredSlots(input.document) : [],
  };
}

export type FreeLaneOutcome =
  | { kind: 'inactive' }
  | { kind: 'observed' }
  | { kind: 'dispatch'; routeDecision: SelectedAutoRoute; plan: FreeLanePlan }
  | { kind: 'stranded'; decision: FreeAutoUnavailable };

function logDecision(input: {
  mode: FreeLaneMode;
  requestId: string;
  decision: FreeAutoDecision;
  dispatchedRouteId: string | null;
}): void {
  const { decision } = input;
  logger.info(
    {
      mode: input.mode,
      requestId: input.requestId,
      status: decision.status,
      selectedRouteId: decision.status === 'selected' ? decision.ranked[0]?.routeId : null,
      rankedRouteIds:
        decision.status === 'selected' ? decision.ranked.map((entry) => entry.routeId) : [],
      rejected: decision.rejected.map((entry) => ({
        routeId: entry.routeId,
        reason: entry.reason,
        ...(entry.retryAtMs !== undefined ? { retryAtMs: entry.retryAtMs } : {}),
      })),
      ...(decision.status === 'free_capacity_unavailable' &&
      decision.earliestRetryAtMs !== undefined
        ? { earliestRetryAtMs: decision.earliestRetryAtMs }
        : {}),
      dispatchedRouteId: input.dispatchedRouteId,
    },
    '[free-lane] stage decision',
  );
}

/**
 * Run the stage over the lane's admitted candidates and say what to do.
 *
 * `freeRouteDecision` is the caller's own `resolveAutoRoute` result for
 * `FREE_LANE_SELECTION`; it is passed in rather than resolved here so this
 * module stays out of the request processor's import cycle.
 */
export async function resolveFreeLaneOutcome(input: {
  mode: FreeLaneMode;
  requestId: string;
  nowMs: number;
  freeRouteDecision: SelectedAutoRoute | null;
  dispatchedRouteId: string | null;
}): Promise<FreeLaneOutcome> {
  const { mode } = input;
  if (!freeLaneObserves(mode)) return { kind: 'inactive' };

  if (!input.freeRouteDecision) {
    logger.warn(
      { mode, requestId: input.requestId },
      '[free-lane] no admitted route for the free selection; the lane has nothing to rank',
    );
    return freeLaneStrandsWhenUnavailable(mode)
      ? { kind: 'stranded', decision: { status: 'free_capacity_unavailable', rejected: [] } }
      : { kind: 'observed' };
  }

  const routes = routesOf(input.freeRouteDecision);
  const routesByRouteId = new Map(routes.map((route) => [route.routeId, route]));
  const candidates = routes.map(toFreeAutoCandidate);
  const state = await getFreeLaneRuntimeState(input.nowMs);
  const decision = resolveFreeAutoRoute({ candidates, state, nowMs: input.nowMs });

  const head =
    freeLaneDispatches(mode) && decision.status === 'selected'
      ? withRankedHead(input.freeRouteDecision, decision.ranked, routesByRouteId)
      : null;

  logDecision({
    mode,
    requestId: input.requestId,
    decision,
    dispatchedRouteId: head ? head.routeId : input.dispatchedRouteId,
  });

  if (head) {
    return {
      kind: 'dispatch',
      routeDecision: head,
      plan: { mode, candidates, state, routesByRouteId, dispatchedRouteId: head.routeId },
    };
  }

  if (decision.status === 'free_capacity_unavailable' && freeLaneStrandsWhenUnavailable(mode)) {
    return { kind: 'stranded', decision };
  }

  return { kind: 'observed' };
}

export function buildFreeCapacityUnavailableResponse(
  decision: FreeAutoUnavailable,
  nowMs: number,
): NextResponse {
  const retryAtMs = decision.earliestRetryAtMs;
  const headers: Record<string, string> = {};
  if (retryAtMs !== undefined) {
    headers[RETRY_AFTER_HEADER] = String(
      Math.max(MIN_RETRY_AFTER_SECONDS, Math.ceil((retryAtMs - nowMs) / MS_PER_SECOND)),
    );
  }

  return NextResponse.json(
    {
      error: {
        message: FREE_CAPACITY_UNAVAILABLE_MESSAGE,
        type: FREE_CAPACITY_UNAVAILABLE_TYPE,
        code: FREE_CAPACITY_UNAVAILABLE_CODE,
        ...(retryAtMs !== undefined ? { retry_at: new Date(retryAtMs).toISOString() } : {}),
        recovery: FREE_CAPACITY_RECOVERY,
      },
    },
    { status: FREE_CAPACITY_UNAVAILABLE_STATUS, headers },
  );
}

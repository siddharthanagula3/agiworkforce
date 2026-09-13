import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  centsFromMicrousdCeil,
  customerChargeMicrousd,
  normalizeBillingPlanTier,
  type RateCardFeature,
} from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { countUserFeatureUnitsSince } from '@/lib/services/cogs-ledger-service';
import { ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { isFreePlanTier } from '@/lib/services/free-trial-service';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  ManagedUsageRequestError,
  estimateMicrousdOf,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';

/**
 * Search is bought per call and never resold, so an unbounded free plan is an
 * unbounded liability. These are per-user counts over a rolling window, not
 * per-turn caps: the per-turn caps in `web-search-tool.ts` bound one answer's
 * token cost, and a user can still run those every turn all month.
 */
export const FREE_PLAN_MONTHLY_SEARCH_CALLS = 20;
export const PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS = 300;
export const SEARCH_BOUND_WINDOW_DAYS = 30;

export const SEARCH_RATE_CARD_FEATURES = [
  'web_search_perplexity',
  'web_search_grounding',
] as const satisfies readonly RateCardFeature[];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const SEARCH_QUOTA_FEATURE = 'search';

/**
 * Surfaces where nobody is watching the turn and search is not an included
 * courtesy: a developer credential, a scheduled run, an AGI Work run, or a
 * deep research run, each of which can issue search calls without a person
 * deciding to.
 */
export type SearchCallerKind = 'interactive' | 'automated';

const AUTOMATED_SURFACES = new Set(['api', 'cli', 'vscode']);

export function resolveSearchCallerKind(input: {
  surface?: string | null;
  agiWork?: boolean;
  research?: boolean;
  scheduled?: boolean;
}): SearchCallerKind {
  if (input.agiWork === true || input.research === true || input.scheduled === true) {
    return 'automated';
  }
  return AUTOMATED_SURFACES.has((input.surface ?? '').toLowerCase()) ? 'automated' : 'interactive';
}

/** The rate card's exact figure. The ledger settles in this unit since 0182. */
export function searchChargeMicrousd(feature: RateCardFeature): number {
  return customerChargeMicrousd(feature, { included: false });
}

export function searchChargeCents(feature: RateCardFeature): number {
  return centsFromMicrousdCeil(searchChargeMicrousd(feature));
}

export function includedMonthlySearchCalls(planTier: string | null | undefined): number {
  return isFreePlanTier(planTier)
    ? FREE_PLAN_MONTHLY_SEARCH_CALLS
    : PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS;
}

export type SearchBudgetDecision =
  | { outcome: 'included' }
  | {
      outcome: 'charge';
      feature: RateCardFeature;
      chargeMicrousd: number;
      chargeCents: number;
    }
  | { outcome: 'blocked'; reason: 'plan_bound' | 'insufficient_credits' };

export interface SearchBudgetInput {
  userId: string;
  planTier: string | null | undefined;
  feature: RateCardFeature;
  callerKind: SearchCallerKind;
  db?: DatabaseAdapter;
  now?: Date;
}

/**
 * Whether this search call is included, charged, or refused, before it runs.
 * A count that cannot be read fails OPEN as included: a metering outage must
 * not silently start charging, nor block every search-enabled turn.
 */
export async function resolveSearchBudget(input: SearchBudgetInput): Promise<SearchBudgetDecision> {
  const chargeMicrousd = searchChargeMicrousd(input.feature);
  const chargeCents = centsFromMicrousdCeil(chargeMicrousd);

  if (input.callerKind === 'automated') {
    return { outcome: 'charge', feature: input.feature, chargeMicrousd, chargeCents };
  }

  const since = new Date(
    (input.now ?? new Date()).getTime() - SEARCH_BOUND_WINDOW_DAYS * MILLISECONDS_PER_DAY,
  );

  let used: number;
  try {
    used = await countUserFeatureUnitsSince(
      input.userId,
      SEARCH_RATE_CARD_FEATURES,
      since,
      input.db,
    );
  } catch (error) {
    logger.error(
      { event: 'search_budget_count_unreadable', error, userId: input.userId },
      '[web-search] search call count could not be read; treating this call as included',
    );
    return { outcome: 'included' };
  }

  if (used < includedMonthlySearchCalls(input.planTier)) return { outcome: 'included' };
  if (isFreePlanTier(input.planTier)) return { outcome: 'blocked', reason: 'plan_bound' };
  return { outcome: 'charge', feature: input.feature, chargeMicrousd, chargeCents };
}

/**
 * A search call's hold on the account, carried from admission to settlement.
 * Holds only the fields the ledger needs; the scoped connection is supplied
 * again at settlement.
 */
export interface SearchChargeReservation {
  idempotencyKey: string;
  requestHash: string;
  leaseToken: string;
  estimatedCostMicrousd: number;
  provider: string;
  feature: RateCardFeature;
}

export type SearchChargeReservationOutcome =
  | { outcome: 'reserved'; reservation: SearchChargeReservation }
  /** The account cannot pay. The search must not run. */
  | { outcome: 'refused'; error: ManagedUsageRequestError }
  /** Nothing to hold, or billing could not answer. The search runs uncharged. */
  | { outcome: 'unreserved' };

/**
 * Provider-native grounding settles once at the end of a turn rather than per
 * tool call, so it needs its own key space; without one it would collide with
 * the turn's first `web_search` call and one of the two would go uncharged.
 */
export type SearchChargeScope = 'tool' | 'grounding';

export function searchChargeIdempotencyKey(
  requestId: string,
  callOrdinal: number,
  scope: SearchChargeScope = 'tool',
): string {
  return scope === 'tool'
    ? `search:${requestId}:${callOrdinal}`
    : `search:${requestId}:${scope}:${callOrdinal}`;
}

export interface SearchReservationInput {
  userId: string;
  organizationId?: string | null;
  planTier: string | null | undefined;
  requestId: string;
  callOrdinal: number;
  feature: RateCardFeature;
  /** Who sells the call. The rate card names the price, not the seller. */
  provider: string;
  chargeMicrousd: number;
  scope?: SearchChargeScope;
  db: DatabaseAdapter;
}

/**
 * One search call is bought per lease, and the whole exchange is short.
 */
const SEARCH_LEASE_SECONDS = 300;

/**
 * Holds the call's charge against the account BEFORE the search runs. A
 * quota block is a refusal the caller must honour; anything else fails OPEN,
 * because a cent of search is not worth failing the turn over and the COGS row
 * is written either way.
 */
export async function reserveSearchCharge(
  input: SearchReservationInput,
): Promise<SearchChargeReservationOutcome> {
  const chargeMicrousd = Math.round(input.chargeMicrousd);
  if (chargeMicrousd <= 0) return { outcome: 'unreserved' };

  const scope = input.scope ?? 'tool';
  try {
    const reservation = await reserveManagedUsageRequest({
      db: input.db,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      idempotencyKey: searchChargeIdempotencyKey(input.requestId, input.callOrdinal, scope),
      requestHash: fingerprintManagedUsageRequest({
        feature: input.feature,
        scope,
        callOrdinal: input.callOrdinal,
      }),
      provider: input.provider,
      model: input.feature,
      estimatedCostMicrousd: chargeMicrousd,
      leaseSeconds: SEARCH_LEASE_SECONDS,
      planTier: normalizeBillingPlanTier(input.planTier),
      isFlagship: false,
      quotaFeature: SEARCH_QUOTA_FEATURE,
    });
    return {
      outcome: 'reserved',
      reservation: {
        idempotencyKey: reservation.idempotencyKey,
        requestHash: reservation.requestHash,
        leaseToken: reservation.leaseToken,
        estimatedCostMicrousd: estimateMicrousdOf(reservation),
        provider: input.provider,
        feature: input.feature,
      },
    };
  } catch (error) {
    const managed = error instanceof ManagedUsageRequestError ? error : null;
    if (managed && (managed.status === 402 || managed.status === 429)) {
      logger.warn(
        {
          event: 'search_charge_refused',
          userId: input.userId,
          code: managed.code,
          feature: input.feature,
        },
        '[web-search] search reservation refused; the call will not run',
      );
      return { outcome: 'refused', error: managed };
    }
    logger.error(
      {
        event: 'search_charge_unreserved',
        error,
        userId: input.userId,
        code: managed?.code ?? null,
      },
      '[web-search] search charge could not be reserved; the call runs uncharged',
    );
    return { outcome: 'unreserved' };
  }
}

export interface SearchChargeInput {
  userId: string;
  reservation: SearchChargeReservation;
  surface?: string | null;
  db: DatabaseAdapter;
}

/**
 * Settles what the reserved call actually cost and releases the rest. The
 * charge is the rate card's fixed per-call figure, so this normally settles
 * the whole hold. A settlement that cannot be written fails OPEN: the lease
 * recovery sweep reclaims the hold rather than the turn dying on its own
 * accounting.
 */
export async function settleSearchCharge(input: SearchChargeInput): Promise<void> {
  const reservation = input.reservation;
  try {
    await finalizeManagedUsageRequest({
      db: input.db,
      userId: input.userId,
      idempotencyKey: reservation.idempotencyKey,
      requestHash: reservation.requestHash,
      leaseToken: reservation.leaseToken,
      estimatedCostMicrousd: reservation.estimatedCostMicrousd,
      estimatedCostCents: ledgerCentsFromMicrousd(reservation.estimatedCostMicrousd),
      quotaFeature: SEARCH_QUOTA_FEATURE,
      provider: reservation.provider,
      model: reservation.feature,
      outcome: 'completed',
      actualCostMicrousd: reservation.estimatedCostMicrousd,
      usage: {
        operation: SEARCH_QUOTA_FEATURE,
        feature: reservation.feature,
        ...(input.surface ? { surface: input.surface } : {}),
      },
    });
  } catch (error) {
    logger.error(
      { event: 'search_charge_unsettled', error, userId: input.userId },
      '[web-search] search charge could not be settled; the reservation is left to recovery',
    );
  }
}

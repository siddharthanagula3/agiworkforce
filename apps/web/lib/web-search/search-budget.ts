import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  chargeCreditsForMicrousd,
  microusdFromCredits,
  normalizeBillingPlanTier,
  type RateCardFeature,
} from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import type { SearchAllowance } from './search-allowance';
import {
  countUserFeatureUnitsSince,
  managedUsageCostSourceRef,
  recordSettledProviderCost,
} from '@/lib/services/cogs-ledger-service';
import { CreditService, ledgerCentsFromMicrousd } from '@/lib/services/credit-service';
import { isFreePlanTier } from '@/lib/services/free-trial-service';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  ManagedUsageRequestError,
  estimateMicrousdOf,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
  type ManagedUsageRequestReservation,
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
const SEARCH_COST_OPERATION = 'tool';

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

export function searchChargeMicrousd(providerCostMicrousd: number): number {
  return Math.round(microusdFromCredits(chargeCreditsForMicrousd(providerCostMicrousd)));
}

export function includedMonthlySearchCalls(planTier: string | null | undefined): number {
  return isFreePlanTier(planTier)
    ? FREE_PLAN_MONTHLY_SEARCH_CALLS
    : PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS;
}

export type SearchBudgetDecision =
  | { outcome: 'included' }
  | { outcome: 'charge' }
  | { outcome: 'blocked'; reason: 'plan_bound' | 'insufficient_credits' };

export interface SearchBudgetInput {
  userId: string;
  planTier: string | null | undefined;
  callerKind: SearchCallerKind;
  db?: DatabaseAdapter;
  now?: Date;
}

async function readSearchCallCount(input: {
  userId: string;
  db?: DatabaseAdapter;
  now?: Date;
}): Promise<number | null> {
  const since = new Date(
    (input.now ?? new Date()).getTime() - SEARCH_BOUND_WINDOW_DAYS * MILLISECONDS_PER_DAY,
  );
  try {
    const used = await countUserFeatureUnitsSince(
      input.userId,
      SEARCH_RATE_CARD_FEATURES,
      since,
      input.db,
    );
    if (Number.isFinite(used) && used >= 0) return used;
    logger.error(
      { event: 'search_budget_count_invalid', used, userId: input.userId },
      '[web-search] search call count was invalid',
    );
  } catch (error) {
    logger.error(
      { event: 'search_budget_count_unreadable', error, userId: input.userId },
      '[web-search] search call count could not be read',
    );
  }
  return null;
}

export async function readSearchAllowance(
  input: Pick<SearchBudgetInput, 'userId' | 'planTier' | 'db' | 'now'>,
): Promise<SearchAllowance> {
  if (!isFreePlanTier(input.planTier)) return { status: 'paid' };
  const limit = FREE_PLAN_MONTHLY_SEARCH_CALLS;
  const used = await readSearchCallCount(input);
  if (used === null) return { status: 'unknown', limit, windowDays: SEARCH_BOUND_WINDOW_DAYS };
  return {
    status: used >= limit ? 'exhausted' : 'available',
    used,
    limit,
    windowDays: SEARCH_BOUND_WINDOW_DAYS,
  };
}

/**
 * Whether this search call is included, charged, or refused, before it runs.
 * A count that cannot be read fails OPEN as included: a metering outage must
 * not silently start charging, nor block every search-enabled turn.
 */
export async function resolveSearchBudget(input: SearchBudgetInput): Promise<SearchBudgetDecision> {
  if (input.callerKind === 'automated') return { outcome: 'charge' };

  const used = await readSearchCallCount(input);
  if (used === null) return { outcome: 'included' };

  if (used < includedMonthlySearchCalls(input.planTier)) return { outcome: 'included' };
  if (isFreePlanTier(input.planTier)) return { outcome: 'blocked', reason: 'plan_bound' };
  return { outcome: 'charge' };
}

export interface SearchCharge {
  idempotencyKey: string;
  chargeMicrousd: number;
  provider: string;
  feature: RateCardFeature;
}

export type SearchAdmission =
  | { kind: 'included' }
  | { kind: 'reserved'; charge: SearchCharge; requestHash: string; leaseToken: string }
  | { kind: 'deferred'; charge: SearchCharge };

export const INCLUDED_SEARCH_ADMISSION: SearchAdmission = { kind: 'included' };

export type SearchChargeReservationOutcome =
  | { outcome: 'admitted'; admission: SearchAdmission }
  | { outcome: 'refused'; error: ManagedUsageRequestError };

/**
 * Provider-native grounding settles once at the end of a turn rather than per
 * tool call, so it needs its own key space; without one it would collide with
 * the turn's first `web_search` call and one of the two would go uncharged.
 */
export type SearchChargeScope = 'tool' | 'grounding' | 'places';

export function searchChargeIdempotencyKey(
  requestId: string,
  callRef: number | string,
  scope: SearchChargeScope = 'tool',
): string {
  return scope === 'tool'
    ? `search:${requestId}:${callRef}`
    : `search:${requestId}:${scope}:${callRef}`;
}

export interface SearchReservationInput {
  userId: string;
  organizationId?: string | null;
  planTier: string | null | undefined;
  requestId: string;
  callRef: number | string;
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

export async function reserveSearchCharge(
  input: SearchReservationInput,
): Promise<SearchChargeReservationOutcome> {
  const chargeMicrousd = Math.round(input.chargeMicrousd);
  if (chargeMicrousd <= 0) return { outcome: 'admitted', admission: INCLUDED_SEARCH_ADMISSION };

  const scope = input.scope ?? 'tool';
  const charge: SearchCharge = {
    idempotencyKey: searchChargeIdempotencyKey(input.requestId, input.callRef, scope),
    chargeMicrousd,
    provider: input.provider,
    feature: input.feature,
  };
  try {
    const reservation = await reserveManagedUsageRequest({
      db: input.db,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      idempotencyKey: charge.idempotencyKey,
      requestHash: fingerprintManagedUsageRequest({
        feature: input.feature,
        scope,
        callRef: input.callRef,
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
      outcome: 'admitted',
      admission: {
        kind: 'reserved',
        charge: {
          ...charge,
          idempotencyKey: reservation.idempotencyKey,
          chargeMicrousd: estimateMicrousdOf(reservation),
        },
        requestHash: reservation.requestHash,
        leaseToken: reservation.leaseToken,
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
        event: 'search_charge_deferred',
        error,
        userId: input.userId,
        code: managed?.code ?? null,
        feature: input.feature,
        chargeMicrousd,
      },
      '[web-search] search charge could not be held; the call runs and its charge is queued',
    );
    return { outcome: 'admitted', admission: { kind: 'deferred', charge } };
  }
}

export interface SearchCallSettlement {
  userId: string;
  organizationId?: string | null;
  admission: SearchAdmission;
  feature: RateCardFeature;
  provider: string;
  model?: string | null;
  tool: string;
  calls: number;
  providerCostMicrousd: number;
  charged: boolean;
  delivered: boolean;
  costRef: string;
  taskRef: string;
  surface?: string | null;
  db: DatabaseAdapter;
}

function searchUsage(input: SearchCallSettlement): Record<string, unknown> {
  return {
    operation: SEARCH_COST_OPERATION,
    tool: input.tool,
    requests: input.calls,
    feature: input.feature,
    ...(input.surface ? { surface: input.surface } : {}),
  };
}

async function recordSearchCost(
  input: SearchCallSettlement,
  row: { chargeMicrousd: number; sourceRef: string },
): Promise<void> {
  await recordSettledProviderCost({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    provider: input.provider,
    model: input.model ?? null,
    actualCostCents: ledgerCentsFromMicrousd(input.providerCostMicrousd),
    providerEstimatedCostMicrousd: input.providerCostMicrousd,
    customerCanonicalMicrousd: row.chargeMicrousd,
    sourceRef: row.sourceRef,
    taskOutcome: input.delivered ? 'delivered' : 'undelivered',
    taskRef: input.taskRef,
    feature: input.feature,
    surface: input.surface ?? null,
    usage: searchUsage(input),
  });
}

async function finalizeSearchHold(
  input: SearchCallSettlement,
  admission: Extract<SearchAdmission, { kind: 'reserved' }>,
  chargeMicrousd: number,
): Promise<void> {
  const reservation: ManagedUsageRequestReservation = {
    db: input.db,
    userId: input.userId,
    idempotencyKey: admission.charge.idempotencyKey,
    requestHash: admission.requestHash,
    leaseToken: admission.leaseToken,
    estimatedCostMicrousd: admission.charge.chargeMicrousd,
    estimatedCostCents: ledgerCentsFromMicrousd(admission.charge.chargeMicrousd),
    quotaFeature: SEARCH_QUOTA_FEATURE,
    provider: admission.charge.provider,
    model: admission.charge.feature,
  };
  try {
    if (chargeMicrousd > 0) await markManagedUsageProviderStarted(reservation);
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: chargeMicrousd > 0 ? 'completed' : 'failed',
      actualCostMicrousd: chargeMicrousd,
      providerCostMicrousd: input.providerCostMicrousd,
      usage: searchUsage(input),
    });
  } catch (error) {
    logger.error(
      {
        event: 'search_charge_unsettled',
        error,
        userId: input.userId,
        feature: input.feature,
        chargeMicrousd,
      },
      '[web-search] search charge could not be settled; the lease recovery sweep releases the hold',
    );
  }
}

async function queueDeferredSearchCharge(
  input: SearchCallSettlement,
  charge: SearchCharge,
): Promise<void> {
  try {
    await CreditService.settleCreditsDurably(
      {
        userId: input.userId,
        amountMicrousd: charge.chargeMicrousd,
        description: 'Search charge settled after its hold could not be placed',
        metadata: {
          quotaFeature: SEARCH_QUOTA_FEATURE,
          feature: charge.feature,
          provider: charge.provider,
          idempotency_key: charge.idempotencyKey,
        },
        idempotencyKey: CreditService.generateIdempotencyKey(
          input.userId,
          'reconciliation',
          `${charge.idempotencyKey}:deferred`,
        ),
      },
      input.db,
    );
  } catch (error) {
    logger.error(
      {
        event: 'search_charge_unqueued',
        error,
        userId: input.userId,
        feature: charge.feature,
        chargeMicrousd: charge.chargeMicrousd,
      },
      '[web-search] deferred search charge could not be queued; this call is unbilled',
    );
  }
}

export async function settleSearchCall(input: SearchCallSettlement): Promise<void> {
  const admission = input.admission;
  const chargeMicrousd =
    input.charged && admission.kind !== 'included' ? admission.charge.chargeMicrousd : 0;

  if (input.providerCostMicrousd > 0 || chargeMicrousd > 0) {
    await recordSearchCost(input, {
      chargeMicrousd,
      sourceRef:
        admission.kind === 'reserved' && chargeMicrousd > 0
          ? managedUsageCostSourceRef({
              userId: input.userId,
              idempotencyKey: admission.charge.idempotencyKey,
              requestHash: admission.requestHash,
            })
          : input.costRef,
    });
  }

  if (admission.kind === 'reserved') {
    await finalizeSearchHold(input, admission, chargeMicrousd);
  } else if (admission.kind === 'deferred' && chargeMicrousd > 0) {
    await queueDeferredSearchCharge(input, admission.charge);
  }
}

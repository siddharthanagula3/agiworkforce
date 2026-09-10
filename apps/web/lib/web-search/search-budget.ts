import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  centsFromMicrousdCeil,
  customerChargeMicrousd,
  type RateCardFeature,
} from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { countUserFeatureUnitsSince } from '@/lib/services/cogs-ledger-service';
import { CreditService, CreditSettlementUnavailableError } from '@/lib/services/credit-service';
import { isFreePlanTier } from '@/lib/services/free-trial-service';

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

export function searchChargeCents(feature: RateCardFeature): number {
  return centsFromMicrousdCeil(customerChargeMicrousd(feature, { included: false }));
}

export function includedMonthlySearchCalls(planTier: string | null | undefined): number {
  return isFreePlanTier(planTier)
    ? FREE_PLAN_MONTHLY_SEARCH_CALLS
    : PAID_PLAN_INCLUDED_MONTHLY_SEARCH_CALLS;
}

export type SearchBudgetDecision =
  | { outcome: 'included' }
  | { outcome: 'charge'; feature: RateCardFeature; chargeCents: number }
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
  const chargeCents = searchChargeCents(input.feature);

  if (input.callerKind === 'automated') {
    return { outcome: 'charge', feature: input.feature, chargeCents };
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
  return { outcome: 'charge', feature: input.feature, chargeCents };
}

export interface SearchChargeInput {
  userId: string;
  requestId: string;
  callOrdinal: number;
  feature: RateCardFeature;
  chargeCents: number;
  surface?: string | null;
  scope?: SearchChargeScope;
  db: DatabaseAdapter;
}

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

/**
 * Deducts one search call's charge. Returns false only when the account cannot
 * pay, which is a refusal the caller must honour. A settlement backend that is
 * unreachable fails OPEN: a cent of search is not worth failing the turn over,
 * and the COGS row is still written either way.
 */
export async function settleSearchCharge(input: SearchChargeInput): Promise<boolean> {
  if (input.chargeCents <= 0) return true;

  try {
    const result = await CreditService.settleCreditsDurably(
      {
        userId: input.userId,
        amountCents: input.chargeCents,
        description: 'Web search',
        idempotencyKey: searchChargeIdempotencyKey(
          input.requestId,
          input.callOrdinal,
          input.scope ?? 'tool',
        ),
        metadata: {
          type: SEARCH_QUOTA_FEATURE,
          quotaFeature: SEARCH_QUOTA_FEATURE,
          feature: input.feature,
          ...(input.surface ? { surface: input.surface } : {}),
        },
      },
      input.db,
    );
    if (!result.success && result.status === 'terminal') {
      logger.warn(
        {
          event: 'search_charge_refused',
          userId: input.userId,
          code: result.code,
          feature: input.feature,
        },
        '[web-search] search charge refused; the call will not run',
      );
      return false;
    }
    return true;
  } catch (error) {
    const unavailable = error instanceof CreditSettlementUnavailableError;
    logger.error(
      { event: 'search_charge_unsettled', error, userId: input.userId, unavailable },
      '[web-search] search charge could not be settled; the call runs uncharged',
    );
    return true;
  }
}

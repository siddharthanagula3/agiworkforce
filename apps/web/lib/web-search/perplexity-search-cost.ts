import 'server-only';

import {
  MICROUSD_PER_CENT,
  RATE_CARD_PROVIDER_COGS_ENV,
  resolveFeatureRate,
} from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';

export const PERPLEXITY_SEARCH_FEATURE = 'web_search_perplexity';
export const PERPLEXITY_SEARCH_UNIT_PRICE_ENV = RATE_CARD_PROVIDER_COGS_ENV.web_search_perplexity;
const PERPLEXITY_SEARCH_TOOL_NAME = 'perplexity_search';
export const PERPLEXITY_SEARCH_PROVIDER_ID = 'perplexity';
const PERPLEXITY_COST_SOURCE_PREFIX = 'perplexity_search';

/** The rate card's per-request provider rate: one billing unit per successful call. */
export function perplexitySearchMicrousdPerCall(): number {
  const rate = resolveFeatureRate(PERPLEXITY_SEARCH_FEATURE);
  if (rate.overrideInvalid) {
    logger.error(
      { env: rate.overrideEnv, value: process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV] },
      '[web-search] invalid Perplexity unit price override; falling back to the published rate',
    );
  }
  return rate.providerCogsMicrousd ?? 0;
}

export function perplexitySearchCostCents(calls: number): number {
  if (!Number.isFinite(calls) || calls <= 0) return 0;
  return Math.round((calls * perplexitySearchMicrousdPerCall()) / MICROUSD_PER_CENT);
}

export interface PerplexitySearchCostInput {
  userId: string;
  organizationId?: string | null;
  turnRef: string;
  calls: number;
  /** The client surface the turn came from, so interactive and automated search can be told apart. */
  surface?: string | null;
  /** What the customer was charged for these calls, when the surface is not one that includes search. */
  customerChargeCents?: number | null;
}

/**
 * Records successful Perplexity Search API calls made through this app's
 * own web-search fallback (used both when a provider has no native search
 * and when a native-search provider's grounding pool is spent). Perplexity
 * bills every successful request regardless of whether the turn's final
 * answer used the results, so this fires once per successful call rather
 * than waiting on a turn-level delivered signal.
 */
export async function recordPerplexitySearchCost(input: PerplexitySearchCostInput): Promise<void> {
  if (!Number.isFinite(input.calls) || input.calls <= 0) return;

  const costCents = perplexitySearchCostCents(input.calls);
  try {
    await recordSettledProviderCost({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      provider: PERPLEXITY_SEARCH_PROVIDER_ID,
      actualCostCents: costCents,
      sourceRef: `${PERPLEXITY_COST_SOURCE_PREFIX}:${input.turnRef}`,
      taskOutcome: 'delivered',
      taskRef: input.turnRef,
      feature: PERPLEXITY_SEARCH_FEATURE,
      surface: input.surface ?? null,
      customerCanonicalCents: input.customerChargeCents ?? null,
      usage: {
        operation: 'tool',
        tool: PERPLEXITY_SEARCH_TOOL_NAME,
        requests: input.calls,
        unitPriceEnv: PERPLEXITY_SEARCH_UNIT_PRICE_ENV,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        turnRef: input.turnRef,
      },
      '[web-search] could not record the Perplexity search cost event',
    );
  }
}

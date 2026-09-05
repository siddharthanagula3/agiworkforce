import 'server-only';

import { logger } from '@/lib/logger';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { perplexitySearchUsdPerThousandRequests } from '@/lib/web-search/web-search-pricing';

export const PERPLEXITY_SEARCH_UNIT_PRICE_ENV = 'AGI_PERPLEXITY_SEARCH_MICROUSD_PER_CALL';
const PERPLEXITY_SEARCH_TOOL_NAME = 'perplexity_search';
const PERPLEXITY_SEARCH_PROVIDER_ID = 'perplexity';
const PERPLEXITY_COST_SOURCE_PREFIX = 'perplexity_search';

const MICROUSD_PER_CENT = 10_000;
const USD_TO_MICROUSD = 1_000_000;
const REQUESTS_PER_PRICED_BLOCK = 1_000;

function configuredUnitPriceMicrousd(): number | null {
  const raw = process.env[PERPLEXITY_SEARCH_UNIT_PRICE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    logger.error(
      { env: PERPLEXITY_SEARCH_UNIT_PRICE_ENV, value: raw },
      '[web-search] invalid Perplexity unit price override; falling back to the published rate',
    );
    return null;
  }
  return parsed;
}

/** The published per-request rate: one billing unit per successful call. */
export function perplexitySearchMicrousdPerCall(): number {
  return (
    configuredUnitPriceMicrousd() ??
    Math.round(
      (perplexitySearchUsdPerThousandRequests() / REQUESTS_PER_PRICED_BLOCK) * USD_TO_MICROUSD,
    )
  );
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

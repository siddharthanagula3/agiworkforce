import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveFeatureRate } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import {
  searchChargeMicrousd,
  settleSearchCall,
  type SearchAdmission,
} from '@/lib/web-search/search-budget';

export const PERPLEXITY_SEARCH_FEATURE = 'web_search_perplexity';
const PERPLEXITY_SEARCH_TOOL_NAME = 'perplexity_search';
export const PERPLEXITY_SEARCH_PROVIDER_ID = 'perplexity';
const PERPLEXITY_COST_SOURCE_PREFIX = 'perplexity_search';

/** The rate card's per-request provider rate: one billing unit per successful call. */
export function perplexitySearchMicrousdPerCall(): number {
  const rate = resolveFeatureRate(PERPLEXITY_SEARCH_FEATURE);
  if (rate.overrideInvalid) {
    logger.error(
      { env: rate.overrideEnv },
      '[web-search] invalid Perplexity unit price override; falling back to the published rate',
    );
  }
  return rate.providerCogsMicrousd ?? 0;
}

export function perplexitySearchChargeMicrousd(): number {
  return searchChargeMicrousd(perplexitySearchMicrousdPerCall());
}

export interface PerplexitySearchSettlement {
  userId: string;
  organizationId?: string | null;
  admission: SearchAdmission;
  answered: boolean;
  turnRef: string;
  callOrdinal: number;
  surface?: string | null;
  db: DatabaseAdapter;
}

export function settlePerplexitySearchCall(input: PerplexitySearchSettlement): Promise<void> {
  const calls = input.answered ? 1 : 0;
  return settleSearchCall({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    admission: input.admission,
    feature: PERPLEXITY_SEARCH_FEATURE,
    provider: PERPLEXITY_SEARCH_PROVIDER_ID,
    tool: PERPLEXITY_SEARCH_TOOL_NAME,
    calls,
    providerCostMicrousd: calls * perplexitySearchMicrousdPerCall(),
    charged: input.answered,
    delivered: input.answered,
    costRef: `${PERPLEXITY_COST_SOURCE_PREFIX}:${input.turnRef}:${input.callOrdinal}`,
    taskRef: input.turnRef,
    surface: input.surface ?? null,
    db: input.db,
  });
}

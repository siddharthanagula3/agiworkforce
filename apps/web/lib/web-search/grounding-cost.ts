import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MICROUSD_PER_USD, resolveFeatureRate } from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import {
  searchChargeMicrousd,
  settleSearchCall,
  type SearchAdmission,
} from '@/lib/web-search/search-budget';
import { resolveGoogleGroundingPricingTier } from '@/lib/web-search/web-search-pricing';

export const GOOGLE_GROUNDING_FEATURE = 'web_search_grounding';
const GOOGLE_GROUNDING_TOOL_NAME = 'google_search_grounding';
const GROUNDING_COST_SOURCE_PREFIX = 'google_grounding';

const REQUESTS_PER_PRICED_BLOCK = 1_000;

/**
 * The per-call rate for grounded requests beyond the free pool, for the tier
 * `model` resolves to. The current tier is the rate card's published figure;
 * an env override applies uniformly across tiers.
 */
export function googleGroundingMicrousdPerCall(model: string): number {
  const rate = resolveFeatureRate(GOOGLE_GROUNDING_FEATURE);
  if (rate.overrideInvalid) {
    logger.error(
      { env: rate.overrideEnv },
      '[grounding] invalid unit price override; falling back to the published rate',
    );
  }
  if (rate.overrideApplied) return rate.providerCogsMicrousd ?? 0;
  const tier = resolveGoogleGroundingPricingTier(model);
  return Math.round((tier.usdPerThousandBeyondPool / REQUESTS_PER_PRICED_BLOCK) * MICROUSD_PER_USD);
}

export function googleGroundingChargeMicrousd(model: string, groundedUses: number): number {
  if (!Number.isFinite(groundedUses) || groundedUses <= 0) return 0;
  return searchChargeMicrousd(groundedUses * googleGroundingMicrousdPerCall(model));
}

export interface GoogleGroundingSettlement {
  userId: string;
  organizationId?: string | null;
  admission: SearchAdmission;
  providerId: string;
  model: string;
  turnRef: string;
  settlementRef: number;
  billableCalls: number;
  delivered: boolean;
  surface?: string | null;
  db: DatabaseAdapter;
}

export function settleGoogleGroundingSpend(input: GoogleGroundingSettlement): Promise<void> {
  const billableCalls =
    Number.isFinite(input.billableCalls) && input.billableCalls > 0 ? input.billableCalls : 0;
  return settleSearchCall({
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    admission: input.admission,
    feature: GOOGLE_GROUNDING_FEATURE,
    provider: input.providerId,
    model: input.model,
    tool: GOOGLE_GROUNDING_TOOL_NAME,
    calls: billableCalls,
    providerCostMicrousd: billableCalls * googleGroundingMicrousdPerCall(input.model),
    charged: true,
    delivered: input.delivered,
    costRef: `${GROUNDING_COST_SOURCE_PREFIX}:${input.turnRef}:${input.settlementRef}`,
    taskRef: input.turnRef,
    surface: input.surface ?? null,
    db: input.db,
  });
}

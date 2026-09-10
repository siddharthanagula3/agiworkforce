import 'server-only';

import {
  MICROUSD_PER_CENT,
  MICROUSD_PER_USD,
  RATE_CARD_PROVIDER_COGS_ENV,
  resolveFeatureRate,
} from '@agiworkforce/types';

import { logger } from '@/lib/logger';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { resolveGoogleGroundingPricingTier } from '@/lib/web-search/web-search-pricing';

export const GOOGLE_GROUNDING_FEATURE = 'web_search_grounding';
export const GOOGLE_GROUNDING_UNIT_PRICE_ENV = RATE_CARD_PROVIDER_COGS_ENV.web_search_grounding;
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
      { env: rate.overrideEnv, value: process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV] },
      '[grounding] invalid unit price override; falling back to the published rate',
    );
  }
  if (rate.overrideApplied) return rate.providerCogsMicrousd ?? 0;
  const tier = resolveGoogleGroundingPricingTier(model);
  return Math.round((tier.usdPerThousandBeyondPool / REQUESTS_PER_PRICED_BLOCK) * MICROUSD_PER_USD);
}

export function googleGroundingCostCents(billableCalls: number, model: string): number {
  if (!Number.isFinite(billableCalls) || billableCalls <= 0) return 0;
  return Math.round((billableCalls * googleGroundingMicrousdPerCall(model)) / MICROUSD_PER_CENT);
}

export interface GoogleGroundingCostInput {
  userId: string;
  organizationId?: string | null;
  providerId: string;
  model: string;
  turnRef: string;
  billableCalls: number;
  delivered: boolean;
}

/**
 * Records the portion of one turn's grounded Google search responses that
 * landed beyond the free pool for `model`'s pricing tier. A within-pool
 * grounded response costs nothing and is never passed here; `billableCalls`
 * is already that difference (`reserveGroundingPoolUses`'s `billableCalls`).
 */
export async function recordGoogleGroundingCost(input: GoogleGroundingCostInput): Promise<void> {
  if (!Number.isFinite(input.billableCalls) || input.billableCalls <= 0) return;

  const costCents = googleGroundingCostCents(input.billableCalls, input.model);
  try {
    await recordSettledProviderCost({
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      provider: input.providerId,
      model: input.model,
      actualCostCents: costCents,
      sourceRef: `${GROUNDING_COST_SOURCE_PREFIX}:${input.turnRef}`,
      taskOutcome: input.delivered ? 'delivered' : 'undelivered',
      taskRef: input.turnRef,
      usage: {
        operation: 'tool',
        tool: GOOGLE_GROUNDING_TOOL_NAME,
        requests: input.billableCalls,
        unitPriceEnv: GOOGLE_GROUNDING_UNIT_PRICE_ENV,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        turnRef: input.turnRef,
        provider: input.providerId,
      },
      '[grounding] could not record the Google grounding cost event',
    );
  }
}

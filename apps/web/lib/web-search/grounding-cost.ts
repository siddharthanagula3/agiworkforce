import 'server-only';

import { logger } from '@/lib/logger';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';
import { resolveGoogleGroundingPricingTier } from '@/lib/web-search/web-search-pricing';

export const GOOGLE_GROUNDING_UNIT_PRICE_ENV = 'AGI_GOOGLE_GROUNDING_MICROUSD_PER_CALL';
const GOOGLE_GROUNDING_TOOL_NAME = 'google_search_grounding';
const GROUNDING_COST_SOURCE_PREFIX = 'google_grounding';

const MICROUSD_PER_CENT = 10_000;
const USD_TO_MICROUSD = 1_000_000;
const REQUESTS_PER_PRICED_BLOCK = 1_000;

function configuredUnitPriceMicrousd(): number | null {
  const raw = process.env[GOOGLE_GROUNDING_UNIT_PRICE_ENV];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    logger.error(
      { env: GOOGLE_GROUNDING_UNIT_PRICE_ENV, value: raw },
      '[grounding] invalid unit price override; falling back to the published rate',
    );
    return null;
  }
  return parsed;
}

/**
 * The published per-call rate for grounded requests beyond the free pool,
 * for the tier `model` resolves to in `web-search-pricing.json`. An env
 * override applies uniformly across tiers.
 */
export function googleGroundingMicrousdPerCall(model: string): number {
  const configured = configuredUnitPriceMicrousd();
  if (configured !== null) return configured;
  const tier = resolveGoogleGroundingPricingTier(model);
  return Math.round((tier.usdPerThousandBeyondPool / REQUESTS_PER_PRICED_BLOCK) * USD_TO_MICROUSD);
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

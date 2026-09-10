import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getPlanCodeHarnessDailyCeilingCents } from '@agiworkforce/types';
import { logger } from '@/lib/logger';

export const CODE_HARNESS_QUOTA_FEATURE = 'code_harness';
export const CODE_HARNESS_IDEMPOTENCY_PREFIX = 'code-proxy:';
export const CODE_HARNESS_DAILY_CEILING_CODE = 'code_harness_daily_ceiling_reached';

const CEILING_WINDOW = '24 hours';

/**
 * Spend the coding harness has already committed in the rolling window.
 *
 * Finalized rows carry the settled amount; a row still holding a lease carries
 * only its estimate, and counting that estimate is what stops a burst of
 * concurrent sessions from each passing a ceiling check that none of them has
 * yet been charged against. A declined row never reached the provider.
 */
export async function getCodeHarnessDailySpendCents(
  db: DatabaseAdapter,
  userId: string,
): Promise<number> {
  const rows = await db.query<{ spent_cents: number | string | null }>(
    `select coalesce(sum(coalesce(actual_cost_cents, estimated_cost_cents)), 0)::bigint as spent_cents
       from public.managed_usage_requests
      where user_id = $1
        and created_at >= now() - interval '${CEILING_WINDOW}'
        and status <> 'declined'
        and (usage->>'quotaFeature' = $2 or idempotency_key like $3)`,
    [userId, CODE_HARNESS_QUOTA_FEATURE, `${CODE_HARNESS_IDEMPOTENCY_PREFIX}%`],
  );
  const value = Number(rows[0]?.spent_cents ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export interface CodeHarnessCeilingDecision {
  allowed: boolean;
  ceilingCents: number;
  spentCents: number;
}

/**
 * The defensive second layer behind the managed-usage ledger. The ledger
 * governs a billing period; this governs a day, so a compromised or looping
 * harness cannot spend a whole period's balance in an afternoon.
 *
 * A database failure here fails closed only when the plan has no ceiling at
 * all; otherwise an unreadable ledger is treated as spent, since the ledger
 * reservation that follows is the layer that may not be guessed at.
 */
export async function evaluateCodeHarnessDailyCeiling(input: {
  db: DatabaseAdapter;
  userId: string;
  planTier: string | null | undefined;
  estimatedCostCents: number;
}): Promise<CodeHarnessCeilingDecision> {
  const ceilingCents = getPlanCodeHarnessDailyCeilingCents(input.planTier);
  if (ceilingCents === Number.POSITIVE_INFINITY) {
    return { allowed: true, ceilingCents, spentCents: 0 };
  }
  if (ceilingCents <= 0) {
    return { allowed: false, ceilingCents, spentCents: 0 };
  }

  let spentCents: number;
  try {
    spentCents = await getCodeHarnessDailySpendCents(input.db, input.userId);
  } catch (error) {
    logger.error(
      { error, userId: input.userId },
      '[e2b] provider-proxy could not read the coding-harness daily spend; refusing the call',
    );
    return { allowed: false, ceilingCents, spentCents: ceilingCents };
  }

  return {
    allowed: spentCents + input.estimatedCostCents <= ceilingCents,
    ceilingCents,
    spentCents,
  };
}

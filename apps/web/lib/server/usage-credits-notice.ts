import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  getPlanUsageBudgetMicrousd,
  isPlanUsageUncapped,
  type PlanAllowanceSubject,
} from '@/lib/server/managed-usage-policy';

/**
 * Carried on the quota-warning channel every client already reads, so a client
 * that does not know the scope ignores it rather than misreading it.
 */
export const USAGE_CREDITS_NOTICE = 'level=info; scope=usage_credits';

export interface UsageCreditsFundingInput {
  db: DatabaseAdapter;
  userId: string;
  plan: PlanAllowanceSubject;
  reservationFundedByCredits: boolean;
  creditsUsedMicrousd: number;
  creditsRemainingMicrousd: number;
  estimatedCostMicrousd: number;
}

async function readPrepaidMicrousd(db: DatabaseAdapter, userId: string): Promise<number> {
  const [row] = await db.query<{ prepaid_microusd: number | string | null }>(
    `select coalesce(purchased_microusd, 0) + coalesce(bonus_microusd, 0) as prepaid_microusd
       from public.prepaid_credit_balances_microusd($1::text)`,
    [userId],
  );
  const value = Number(row?.prepaid_microusd ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Whether this turn is paid from usage credits rather than the plan: a rolling
 * window the reservation had to cover with credits, or a monthly allowance the
 * turn runs past, where the ledger spends the plan first and prepaid credits
 * last.
 */
export async function resolveUsageCreditsNotice(
  input: UsageCreditsFundingInput,
): Promise<string | null> {
  if (input.reservationFundedByCredits) return USAGE_CREDITS_NOTICE;
  if (isPlanUsageUncapped(input.plan)) return null;
  const planBudget = getPlanUsageBudgetMicrousd(input.plan);
  if (planBudget <= 0 || input.creditsUsedMicrousd + input.estimatedCostMicrousd <= planBudget) {
    return null;
  }
  try {
    const prepaid = await readPrepaidMicrousd(input.db, input.userId);
    return prepaid > 0 && input.creditsRemainingMicrousd - input.estimatedCostMicrousd < prepaid
      ? USAGE_CREDITS_NOTICE
      : null;
  } catch (error) {
    logger.warn(
      { error, userId: input.userId },
      'Prepaid credit balance could not be read; no usage credits notice is sent',
    );
    return null;
  }
}

import 'server-only';

import type { BillingPlanTier, ManagedUsageCreditWindow } from '@agiworkforce/types';
import { PLAN_CREDIT_ALLOWANCES, type PlanCreditAllowance } from '@/lib/billing/plan-credits';

/**
 * Null for a plan that has no managed allowance to state: BYOK and local-only
 * spend nothing here, and an uncapped plan has no ceiling a credit figure could
 * name. Every reader falls back to percentages rather than printing a zero
 * allowance a user would read as "you have none left".
 */
export function resolvePlanCreditAllowance(
  plan: string | null | undefined,
): PlanCreditAllowance | null {
  const tier = plan?.trim().toLowerCase() as BillingPlanTier | undefined;
  if (!tier || !Object.prototype.hasOwnProperty.call(PLAN_CREDIT_ALLOWANCES, tier)) return null;
  const allowance = PLAN_CREDIT_ALLOWANCES[tier];
  if (allowance.unlimited || allowance.monthly <= 0) return null;
  return allowance;
}

export function creditWindow(
  allowance: number,
  used: number,
  resetAt: string | null,
): ManagedUsageCreditWindow {
  const boundedUsed = Math.max(0, used);
  return {
    allowance,
    used: boundedUsed,
    remaining: Math.max(0, allowance - boundedUsed),
    reset_at: resetAt,
  };
}

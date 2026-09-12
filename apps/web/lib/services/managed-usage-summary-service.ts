import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  creditsFromCents,
  creditsFromMicrousd,
  isFreeBillingPlanTier,
  type ManagedUsageCredits,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import { creditWindow, resolvePlanCreditAllowance } from '@/lib/billing/usage-credits';
import {
  getPlanFlagshipWeeklyUsageBudgetMicrousd,
  getPlanSessionUsageBudgetMicrousd,
  getPlanWeeklyUsagePaidBudgetMicrousd,
  toPublicUsagePercentage,
} from '@/lib/server/managed-usage-policy';
import { getRollingUsage } from '@/lib/server/rolling-usage';
import {
  ROLLING_SESSION_WINDOW_HOURS,
  ROLLING_WEEKLY_WINDOW_HOURS,
  rollingResetAt,
  toIsoTimestamp,
} from '@/lib/server/capability-limit-resets';
import { getSpendableCredits } from '@/lib/server/spendable-credits';
import { CreditService } from '@/lib/services/credit-service';
import { getFreeTrialPublicUsage } from '@/lib/services/free-trial-service';
import { resolveEffectiveSubscription } from '@/lib/services/effective-subscription-service';

export async function getManagedUsageSummary(
  db: DatabaseAdapter,
  userId: string,
): Promise<ManagedUsageSummaryResponse> {
  const [balance, subscription, spendableCredits] = await Promise.all([
    CreditService.getBalance(db, userId),
    resolveEffectiveSubscription(db, userId),
    getSpendableCredits(db, userId),
  ]);

  const planTier = subscription?.plan_tier || 'free';
  const creditsAllocated = balance?.credits_allocated_cents ?? 0;
  const creditsUsed = balance?.credits_used_cents ?? 0;
  const periodStart = balance?.period_start ?? subscription?.current_period_start ?? null;
  const periodEnd = balance?.period_end ?? subscription?.current_period_end ?? null;

  const isFreePlan = isFreeBillingPlanTier(planTier.toLowerCase());
  const freeUsage = isFreePlan ? await getFreeTrialPublicUsage(db, userId) : null;
  const usagePercentage =
    freeUsage?.usagePercentage ?? toPublicUsagePercentage(creditsUsed, creditsAllocated);
  const usageResetAt = freeUsage?.resetAt ?? toIsoTimestamp(periodEnd);

  // The caps are compared against rolling spend, and rolling spend is summed in
  // microUSD since 0182. Comparing a microUSD total against a cents cap is the
  // unit error this whole file exists to avoid, so the caps come in microUSD too.
  const sessionCapMicrousd = getPlanSessionUsageBudgetMicrousd(planTier);
  const weeklyCapMicrousd = getPlanWeeklyUsagePaidBudgetMicrousd(planTier);
  const flagshipWeeklyCapMicrousd = getPlanFlagshipWeeklyUsageBudgetMicrousd(planTier);

  const [session, weekly, flagshipWeekly] =
    sessionCapMicrousd > 0 || weeklyCapMicrousd > 0
      ? await Promise.all([
          getRollingUsage(db, userId, ROLLING_SESSION_WINDOW_HOURS, false),
          getRollingUsage(db, userId, ROLLING_WEEKLY_WINDOW_HOURS, false),
          getRollingUsage(db, userId, ROLLING_WEEKLY_WINDOW_HOURS, true),
        ])
      : [
          { usedMicrousd: 0, usedCents: 0, oldestAt: null },
          { usedMicrousd: 0, usedCents: 0, oldestAt: null },
          { usedMicrousd: 0, usedCents: 0, oldestAt: null },
        ];

  const isUnallocated = !isFreePlan && creditsAllocated <= 0;

  const hasPaidUsageRemaining =
    creditsAllocated > 0 &&
    (balance?.credits_remaining_cents ?? 0) > 0 &&
    (sessionCapMicrousd <= 0 || session.usedMicrousd < sessionCapMicrousd) &&
    (weeklyCapMicrousd <= 0 || weekly.usedMicrousd < weeklyCapMicrousd);

  const sessionResetAt =
    freeUsage?.sessionResetAt ?? rollingResetAt(session.oldestAt, ROLLING_SESSION_WINDOW_HOURS);
  const weeklyResetAt =
    freeUsage?.weeklyResetAt ?? rollingResetAt(weekly.oldestAt, ROLLING_WEEKLY_WINDOW_HOURS);
  const flagshipWeeklyResetAt = rollingResetAt(
    flagshipWeekly.oldestAt,
    ROLLING_WEEKLY_WINDOW_HOURS,
  );

  const planAllowance = resolvePlanCreditAllowance(planTier);
  const credits: ManagedUsageCredits | null = planAllowance
    ? {
        monthly: creditWindow(
          planAllowance.monthly,
          freeUsage
            ? creditsFromMicrousd(freeUsage.monthlyUsedMicrousd)
            : creditsFromCents(creditsUsed),
          usageResetAt,
        ),
        weekly: creditWindow(
          planAllowance.weekly,
          freeUsage
            ? creditsFromMicrousd(freeUsage.weeklyUsedMicrousd)
            : creditsFromMicrousd(weekly.usedMicrousd),
          weeklyResetAt,
        ),
        five_hour: creditWindow(
          planAllowance.fiveHour,
          freeUsage
            ? creditsFromMicrousd(freeUsage.fiveHourUsedMicrousd)
            : creditsFromMicrousd(session.usedMicrousd),
          sessionResetAt,
        ),
        flagship_weekly:
          planAllowance.flagshipWeekly === null
            ? null
            : creditWindow(
                planAllowance.flagshipWeekly,
                creditsFromMicrousd(flagshipWeekly.usedMicrousd),
                flagshipWeeklyResetAt,
              ),
        purchased: {
          remaining:
            spendableCredits.availableCents === null
              ? null
              : creditsFromCents(spendableCredits.availableCents),
          overage_enabled: spendableCredits.overageEnabled,
        },
      }
    : null;

  return {
    plan_tier: planTier,
    usage_percentage: usagePercentage,
    usage_reset_at: usageResetAt,
    has_usage_remaining: freeUsage?.hasUsageRemaining ?? hasPaidUsageRemaining,
    period_start: toIsoTimestamp(periodStart),
    period_end: toIsoTimestamp(periodEnd),
    subscription_status: subscription?.status ?? 'none',
    session_usage_percentage:
      freeUsage?.sessionUsagePercentage ??
      toPublicUsagePercentage(session.usedMicrousd, sessionCapMicrousd),
    session_reset_at: sessionResetAt,
    weekly_usage_percentage:
      freeUsage?.weeklyUsagePercentage ??
      toPublicUsagePercentage(weekly.usedMicrousd, weeklyCapMicrousd),
    weekly_reset_at: weeklyResetAt,
    flagship_weekly_usage_percentage: toPublicUsagePercentage(
      flagshipWeekly.usedMicrousd,
      flagshipWeeklyCapMicrousd,
    ),
    flagship_weekly_reset_at: flagshipWeeklyResetAt,
    credit_balance_cents: spendableCredits.availableCents,
    overage_enabled: spendableCredits.overageEnabled,
    ...(isFreePlan ? {} : { usage_allocation: isUnallocated ? 'pending' : 'provisioned' }),
    ...(credits ? { credits } : {}),
  };
}

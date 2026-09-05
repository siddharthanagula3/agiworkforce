import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';
import {
  getPlanFlagshipWeeklyUsageBudgetCents,
  getPlanSessionUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
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
import { SubscriptionService } from '@/lib/services/subscription-service';

export async function getManagedUsageSummary(
  db: DatabaseAdapter,
  userId: string,
): Promise<ManagedUsageSummaryResponse> {
  const [balance, subscription, spendableCredits] = await Promise.all([
    CreditService.getBalance(db, userId),
    SubscriptionService.getSubscription(db, userId),
    getSpendableCredits(db, userId),
  ]);

  const planTier = subscription?.plan_tier || 'free';
  const creditsAllocated = balance?.credits_allocated_cents ?? 0;
  const creditsUsed = balance?.credits_used_cents ?? 0;
  const periodStart = balance?.period_start ?? subscription?.current_period_start ?? null;
  const periodEnd = balance?.period_end ?? subscription?.current_period_end ?? null;

  const isFreePlan = planTier.toLowerCase() === 'free';
  const freeUsage = isFreePlan ? await getFreeTrialPublicUsage(db, userId) : null;
  const usagePercentage =
    freeUsage?.usagePercentage ?? toPublicUsagePercentage(creditsUsed, creditsAllocated);
  const usageResetAt = freeUsage?.resetAt ?? toIsoTimestamp(periodEnd);

  const sessionCapCents = getPlanSessionUsageBudgetCents(planTier);
  const weeklyCapCents = getPlanWeeklyUsageBudgetCents(planTier);
  const flagshipWeeklyCapCents = getPlanFlagshipWeeklyUsageBudgetCents(planTier);

  const [session, weekly, flagshipWeekly] =
    sessionCapCents > 0 || weeklyCapCents > 0
      ? await Promise.all([
          getRollingUsage(db, userId, ROLLING_SESSION_WINDOW_HOURS, false),
          getRollingUsage(db, userId, ROLLING_WEEKLY_WINDOW_HOURS, false),
          getRollingUsage(db, userId, ROLLING_WEEKLY_WINDOW_HOURS, true),
        ])
      : [
          { usedCents: 0, oldestAt: null },
          { usedCents: 0, oldestAt: null },
          { usedCents: 0, oldestAt: null },
        ];

  const isUnallocated = !isFreePlan && creditsAllocated <= 0;

  const hasPaidUsageRemaining =
    creditsAllocated > 0 &&
    (balance?.credits_remaining_cents ?? 0) > 0 &&
    (sessionCapCents <= 0 || session.usedCents < sessionCapCents) &&
    (weeklyCapCents <= 0 || weekly.usedCents < weeklyCapCents);

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
      toPublicUsagePercentage(session.usedCents, sessionCapCents),
    session_reset_at:
      freeUsage?.sessionResetAt ?? rollingResetAt(session.oldestAt, ROLLING_SESSION_WINDOW_HOURS),
    weekly_usage_percentage:
      freeUsage?.weeklyUsagePercentage ?? toPublicUsagePercentage(weekly.usedCents, weeklyCapCents),
    weekly_reset_at:
      freeUsage?.weeklyResetAt ?? rollingResetAt(weekly.oldestAt, ROLLING_WEEKLY_WINDOW_HOURS),
    flagship_weekly_usage_percentage: toPublicUsagePercentage(
      flagshipWeekly.usedCents,
      flagshipWeeklyCapCents,
    ),
    flagship_weekly_reset_at: rollingResetAt(flagshipWeekly.oldestAt, ROLLING_WEEKLY_WINDOW_HOURS),
    credit_balance_cents: spendableCredits.availableCents,
    overage_enabled: spendableCredits.overageEnabled,
    ...(isFreePlan ? {} : { usage_allocation: isUnallocated ? 'pending' : 'provisioned' }),
  };
}

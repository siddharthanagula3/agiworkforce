import 'server-only';

import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';
import {
  getPlanFlagshipWeeklyUsageBudgetCents,
  getPlanSessionUsageBudgetCents,
  getPlanWeeklyUsageBudgetCents,
  toPublicUsagePercentage,
} from '@/lib/server/managed-usage-policy';
import { getRollingUsage } from '@/lib/server/rolling-usage';
import { CreditService } from '@/lib/services/credit-service';
import { getFreeTrialPublicUsage } from '@/lib/services/free-trial-service';
import { SubscriptionService } from '@/lib/services/subscription-service';

const SESSION_WINDOW_HOURS = 5;
const WEEKLY_WINDOW_HOURS = 7 * 24;

function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getRollingResetAt(oldestAt: string | null, windowHours: number): string | null {
  if (!oldestAt) return null;
  const oldestTimestamp = Date.parse(oldestAt);
  if (Number.isNaN(oldestTimestamp)) return null;
  return new Date(oldestTimestamp + windowHours * 60 * 60 * 1000).toISOString();
}

/**
 * Build the public, percentage-only managed-usage contract for one user.
 * Private allowance operands and ledger rows never cross this service boundary.
 */
export async function getManagedUsageSummary(userId: string): Promise<ManagedUsageSummaryResponse> {
  const [balance, subscription] = await Promise.all([
    CreditService.getBalance(userId),
    SubscriptionService.getSubscription(userId),
  ]);

  const planTier = subscription?.plan_tier || 'free';
  const creditsAllocated = balance?.credits_allocated_cents ?? 0;
  const creditsUsed = balance?.credits_used_cents ?? 0;
  const periodStart = balance?.period_start ?? subscription?.current_period_start ?? null;
  const periodEnd = balance?.period_end ?? subscription?.current_period_end ?? null;

  const isFreePlan = planTier.toLowerCase() === 'free';
  const freeUsage = isFreePlan ? await getFreeTrialPublicUsage(userId) : null;
  const usagePercentage =
    freeUsage?.usagePercentage ?? toPublicUsagePercentage(creditsUsed, creditsAllocated);
  const usageResetAt = freeUsage?.resetAt ?? toIsoTimestamp(periodEnd);

  const sessionCapCents = getPlanSessionUsageBudgetCents(planTier);
  const weeklyCapCents = getPlanWeeklyUsageBudgetCents(planTier);
  const flagshipWeeklyCapCents = getPlanFlagshipWeeklyUsageBudgetCents(planTier);

  const [session, weekly, flagshipWeekly] =
    sessionCapCents > 0 || weeklyCapCents > 0
      ? await Promise.all([
          getRollingUsage(userId, SESSION_WINDOW_HOURS, false),
          getRollingUsage(userId, WEEKLY_WINDOW_HOURS, false),
          getRollingUsage(userId, WEEKLY_WINDOW_HOURS, true),
        ])
      : [
          { usedCents: 0, oldestAt: null },
          { usedCents: 0, oldestAt: null },
          { usedCents: 0, oldestAt: null },
        ];

  const hasPaidUsageRemaining =
    creditsAllocated > 0 &&
    (balance?.credits_remaining_cents ?? 0) > 0 &&
    (sessionCapCents <= 0 || session.usedCents < sessionCapCents) &&
    (weeklyCapCents <= 0 || weekly.usedCents < weeklyCapCents);

  return {
    plan_tier: planTier,
    usage_percentage: usagePercentage,
    usage_reset_at: usageResetAt,
    // The flagship ceiling applies only when the selected route is flagship;
    // exhausting it must not hide otherwise-admissible non-flagship work.
    has_usage_remaining: freeUsage?.hasUsageRemaining ?? hasPaidUsageRemaining,
    period_start: toIsoTimestamp(periodStart),
    period_end: toIsoTimestamp(periodEnd),
    subscription_status: subscription?.status ?? 'none',
    session_usage_percentage: toPublicUsagePercentage(session.usedCents, sessionCapCents),
    session_reset_at: getRollingResetAt(session.oldestAt, SESSION_WINDOW_HOURS),
    weekly_usage_percentage: toPublicUsagePercentage(weekly.usedCents, weeklyCapCents),
    weekly_reset_at: getRollingResetAt(weekly.oldestAt, WEEKLY_WINDOW_HOURS),
    flagship_weekly_usage_percentage: toPublicUsagePercentage(
      flagshipWeekly.usedCents,
      flagshipWeeklyCapCents,
    ),
    flagship_weekly_reset_at: getRollingResetAt(flagshipWeekly.oldestAt, WEEKLY_WINDOW_HOURS),
  };
}

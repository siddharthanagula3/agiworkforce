import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  creditsFromMicrousd,
  isFreeBillingPlanTier,
  type ManagedUsageCredits,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import { creditWindow, resolvePlanCreditAllowance } from '@/lib/billing/usage-credits';
import { logger } from '@/lib/logger';
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

export interface ManagedUsageBonusCredits {
  remaining: number;
  next_expiry_at: string | null;
  next_expiry_credits: number;
}

export interface AccountUsageCredits extends ManagedUsageCredits {
  bonus: ManagedUsageBonusCredits | null;
}

export interface AccountUsageSummary extends Omit<ManagedUsageSummaryResponse, 'credits'> {
  credits?: AccountUsageCredits;
}

interface BonusCreditRow {
  remaining: string | number | null;
  next_expiry_at: string | Date | null;
  next_expiry_credits: string | number | null;
}

const SELECT_LIVE_BONUS_CREDITS = `
  with live as (
    select credits_remaining, expires_at
      from public.bonus_credit_grants
     where user_id = $1
       and revoked_at is null
       and credits_remaining > 0
       and expires_at > now()
  ),
  nearest as (
    select min(expires_at) as expires_at from live
  )
  select coalesce(sum(live.credits_remaining), 0) as remaining,
         nearest.expires_at as next_expiry_at,
         coalesce(
           sum(live.credits_remaining) filter (where live.expires_at = nearest.expires_at),
           0
         ) as next_expiry_credits
    from nearest
    left join live on true
   group by nearest.expires_at`;

function toCredits(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function readBonusCreditBalance(
  db: DatabaseAdapter,
  userId: string,
): Promise<ManagedUsageBonusCredits | null> {
  try {
    const [row] = await db.query<BonusCreditRow>(SELECT_LIVE_BONUS_CREDITS, [userId]);
    return {
      remaining: toCredits(row?.remaining),
      next_expiry_at: toIsoTimestamp(row?.next_expiry_at ?? null),
      next_expiry_credits: toCredits(row?.next_expiry_credits),
    };
  } catch (error) {
    logger.error({ error, userId }, 'Bonus credit lookup failed; reporting unknown balance');
    return null;
  }
}

export async function getManagedUsageSummary(
  db: DatabaseAdapter,
  userId: string,
): Promise<AccountUsageSummary> {
  const [balance, subscription, spendableCredits, bonus] = await Promise.all([
    CreditService.getBalance(db, userId),
    resolveEffectiveSubscription(db, userId),
    getSpendableCredits(db, userId),
    readBonusCreditBalance(db, userId),
  ]);

  const planTier = subscription?.plan_tier || 'free';
  const creditsAllocated = balance?.credits_allocated_microusd ?? 0;
  const creditsUsed = balance?.credits_used_microusd ?? 0;
  const periodStart = balance?.period_start ?? subscription?.current_period_start ?? null;
  const periodEnd = balance?.period_end ?? subscription?.current_period_end ?? null;

  const isFreePlan = isFreeBillingPlanTier(planTier.toLowerCase());
  const freeUsage = isFreePlan ? await getFreeTrialPublicUsage(db, userId) : null;
  const usagePercentage =
    freeUsage?.usagePercentage ?? toPublicUsagePercentage(creditsUsed, creditsAllocated);
  const usageResetAt = freeUsage?.resetAt ?? toIsoTimestamp(periodEnd);

  const sessionCapMicrousd = getPlanSessionUsageBudgetMicrousd(planTier);
  const weeklyCapMicrousd = getPlanWeeklyUsagePaidBudgetMicrousd(planTier);
  const flagshipWeeklyCapMicrousd = getPlanFlagshipWeeklyUsageBudgetMicrousd(planTier);

  const [session, weekly, flagshipWeekly] =
    !isFreePlan && (sessionCapMicrousd > 0 || weeklyCapMicrousd > 0)
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
    (balance?.credits_remaining_microusd ?? 0) > 0 &&
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

  const planAllowance = isFreePlan ? null : resolvePlanCreditAllowance(planTier);
  const credits: AccountUsageCredits | null = planAllowance
    ? {
        monthly: creditWindow(
          planAllowance.monthly,
          creditsFromMicrousd(creditsUsed),
          usageResetAt,
        ),
        weekly: creditWindow(
          planAllowance.weekly,
          creditsFromMicrousd(weekly.usedMicrousd),
          weeklyResetAt,
        ),
        five_hour: creditWindow(
          planAllowance.fiveHour,
          creditsFromMicrousd(session.usedMicrousd),
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
            spendableCredits.availableMicrousd === null
              ? null
              : creditsFromMicrousd(spendableCredits.availableMicrousd),
          overage_enabled: spendableCredits.overageEnabled,
        },
        bonus,
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

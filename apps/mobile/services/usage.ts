import { api } from './api';
import { FEATURES } from '@/lib/v1FeatureFlags';

// ---------------------------------------------------------------------------
// Types — mirrors apps/web/app/api/usage/route.ts's actual response shape.
// ---------------------------------------------------------------------------

export interface UsageSnapshot {
  planTier: string;
  creditsAllocatedCents: number;
  creditsUsedCents: number;
  creditsRemainingCents: number;
  /** 0-100, already clamped-rounded server-side. */
  usagePercentage: number;
  periodStart: string | null;
  periodEnd: string | null;
  dailyUsedCents: number;
  dailyLimitCents: number;
  dailyRemainingCents: number;
  hasDailyLimit: boolean;
  subscriptionStatus: string;
  /**
   * Session (rolling 5h) / weekly / flagship-weekly caps layer on top of the
   * monthly credit budget above (founder decision, 2026-07-05) — see
   * getPlanWeeklyUsageBudgetCents in @agiworkforce/types/billing-catalog.
   * Cap of 0 means "not applicable for this tier" (e.g. free); callers
   * should hide that section rather than show a 0/0 bar.
   */
  sessionUsedCents: number;
  sessionCapCents: number;
  sessionResetAt: string | null;
  weeklyUsedCents: number;
  weeklyCapCents: number;
  weeklyResetAt: string | null;
  flagshipWeeklyUsedCents: number;
  flagshipWeeklyCapCents: number;
  flagshipWeeklyResetAt: string | null;
}

interface UsageApiResponse {
  plan_tier: string;
  credits_allocated_cents: number;
  credits_used_cents: number;
  credits_remaining_cents: number;
  usage_percentage: number;
  period_start: string | null;
  period_end: string | null;
  daily_used_cents: number;
  daily_limit_cents: number;
  daily_remaining_cents: number;
  has_daily_limit: boolean;
  subscription_status: string;
  session_used_cents: number;
  session_cap_cents: number;
  session_reset_at: string | null;
  weekly_used_cents: number;
  weekly_cap_cents: number;
  weekly_reset_at: string | null;
  flagship_weekly_used_cents: number;
  flagship_weekly_cap_cents: number;
  flagship_weekly_reset_at: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Fetch the user's current usage snapshot (plan allowance vs. usage, as a
 * percentage — see GET /api/usage). Throws on network/auth failure; callers
 * should catch and handle gracefully.
 */
export async function fetchUsageSnapshot(): Promise<UsageSnapshot> {
  if (!FEATURES.usageDashboard) throw new Error('usage: cloud usage not available in v1');
  const data = await api.get<UsageApiResponse>('/api/usage');
  return {
    planTier: data.plan_tier,
    creditsAllocatedCents: data.credits_allocated_cents,
    creditsUsedCents: data.credits_used_cents,
    creditsRemainingCents: data.credits_remaining_cents,
    usagePercentage: data.usage_percentage,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    dailyUsedCents: data.daily_used_cents,
    dailyLimitCents: data.daily_limit_cents,
    dailyRemainingCents: data.daily_remaining_cents,
    hasDailyLimit: data.has_daily_limit,
    subscriptionStatus: data.subscription_status,
    sessionUsedCents: data.session_used_cents,
    sessionCapCents: data.session_cap_cents,
    sessionResetAt: data.session_reset_at,
    weeklyUsedCents: data.weekly_used_cents,
    weeklyCapCents: data.weekly_cap_cents,
    weeklyResetAt: data.weekly_reset_at,
    flagshipWeeklyUsedCents: data.flagship_weekly_used_cents,
    flagshipWeeklyCapCents: data.flagship_weekly_cap_cents,
    flagshipWeeklyResetAt: data.flagship_weekly_reset_at,
  };
}

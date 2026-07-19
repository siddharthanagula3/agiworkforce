import { api } from './api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  parseManagedUsageSummaryResponse,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Types — the canonical PERCENTAGE-ONLY usage contract (GET /api/usage returns
// ManagedUsageSummaryResponse). Private managed-compute allowances (cents /
// ledger units / dollar figures) never cross this boundary, so the app can
// never render exact dollars or divide by an absent cap into $NaN.
// ---------------------------------------------------------------------------

export interface UsageSnapshot {
  planTier: string;
  /** 0-100, already clamped-rounded server-side. */
  usagePercentage: number;
  usageResetAt: string | null;
  hasUsageRemaining: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  subscriptionStatus: string;
  /**
   * Rolling-window usage as percentages of their (private) tier budgets. A
   * `*ResetAt` of null means the window is not active for this tier (e.g. Free)
   * or has no usage yet — callers hide that section rather than show 0/0.
   */
  sessionUsagePercentage: number;
  sessionResetAt: string | null;
  weeklyUsagePercentage: number;
  weeklyResetAt: string | null;
  flagshipWeeklyUsagePercentage: number;
  flagshipWeeklyResetAt: string | null;
}

function project(summary: ManagedUsageSummaryResponse): UsageSnapshot {
  return {
    planTier: summary.plan_tier,
    usagePercentage: summary.usage_percentage,
    usageResetAt: summary.usage_reset_at,
    hasUsageRemaining: summary.has_usage_remaining,
    periodStart: summary.period_start,
    periodEnd: summary.period_end,
    subscriptionStatus: summary.subscription_status,
    sessionUsagePercentage: summary.session_usage_percentage,
    sessionResetAt: summary.session_reset_at,
    weeklyUsagePercentage: summary.weekly_usage_percentage,
    weeklyResetAt: summary.weekly_reset_at,
    flagshipWeeklyUsagePercentage: summary.flagship_weekly_usage_percentage,
    flagshipWeeklyResetAt: summary.flagship_weekly_reset_at,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Fetch the user's current usage snapshot (plan usage as a percentage — see
 * GET /api/usage). The body is validated and projected to the public
 * percentage-only contract; a malformed response throws rather than rendering
 * NaN. Throws on network/auth failure; callers should catch and handle
 * gracefully.
 */
export async function fetchUsageSnapshot(): Promise<UsageSnapshot> {
  if (!FEATURES.usageDashboard) throw new Error('usage: cloud usage not available in v1');
  const data = await api.get<unknown>('/api/usage');
  return project(parseManagedUsageSummaryResponse(data));
}

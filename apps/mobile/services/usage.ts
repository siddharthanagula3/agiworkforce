import { api } from './api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  parseManagedUsageSummaryResponse,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';

export interface UsageSnapshot {
  planTier: string;
  usagePercentage: number;
  usageResetAt: string | null;
  hasUsageRemaining: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  subscriptionStatus: string;
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

export async function fetchUsageSnapshot(): Promise<UsageSnapshot> {
  if (!FEATURES.usageDashboard) throw new Error('usage: cloud usage not available in v1');
  const data = await api.get<unknown>('/api/usage');
  return project(parseManagedUsageSummaryResponse(data));
}

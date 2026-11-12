import * as Crypto from 'expo-crypto';
import { IDEMPOTENCY_KEY_HEADER } from '@agiworkforce/cloud-contracts';
import { api } from './api';
import {
  managedUsageBucketLabel,
  parseAccountUsageHistoryResponse,
  parseAccountUsageLimitsResponse,
  parseManagedUsageSummaryResponse,
  type AccountUsageLimitsResponse,
  type AccountUsageHistoryGranularity,
  type AccountUsageHistoryResponse,
  type ManagedUsageCredits,
  type ManagedUsageSummaryResponse,
  type UsageLimitPromotionState,
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
  credits: ManagedUsageCredits | null;
  usageAllocation?: 'provisioned' | 'pending';
  limitPromotions: UsageLimitPromotionState | null;
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
    credits: summary.credits ?? null,
    limitPromotions: summary.limit_promotions ?? null,
    ...(summary.usage_allocation ? { usageAllocation: summary.usage_allocation } : {}),
  };
}

function percentLeft(used: number): number {
  return Math.round(100 - Math.min(100, Math.max(0, used)));
}

export function tightestUsageWindow(snapshot: UsageSnapshot): string | null {
  const windows = [
    snapshot.sessionResetAt !== null
      ? { bucket: 'session' as const, left: percentLeft(snapshot.sessionUsagePercentage) }
      : null,
    snapshot.weeklyResetAt !== null
      ? { bucket: 'weekly' as const, left: percentLeft(snapshot.weeklyUsagePercentage) }
      : null,
  ].filter((window) => window !== null);
  if (windows.length === 0 && snapshot.usageResetAt !== null) {
    windows.push({ bucket: 'period' as const, left: percentLeft(snapshot.usagePercentage) });
  }
  const tightest = windows.reduce<(typeof windows)[number] | null>(
    (lowest, window) => (lowest === null || window.left < lowest.left ? window : lowest),
    null,
  );
  return tightest ? `${managedUsageBucketLabel(tightest.bucket)} ${tightest.left}%` : null;
}

export async function fetchUsageSnapshot(): Promise<UsageSnapshot> {
  const data = await api.get<unknown>('/api/usage');
  return project(parseManagedUsageSummaryResponse(data));
}

export async function fetchUsageHistory(
  granularity: AccountUsageHistoryGranularity,
): Promise<AccountUsageHistoryResponse> {
  const history = parseAccountUsageHistoryResponse(
    await api.get<unknown>(`/api/usage/history?granularity=${granularity}`),
  );
  if (!history) throw new Error('The usage history could not be read.');
  return history;
}

export async function fetchUsageAllowances(): Promise<AccountUsageLimitsResponse> {
  const allowances = parseAccountUsageLimitsResponse(await api.get<unknown>('/api/usage/limits'));
  if (!allowances) throw new Error('The monthly allowances could not be read.');
  return allowances;
}

export async function applyLimitReset(grantId: string): Promise<void> {
  await api.post<unknown>(
    '/api/usage/limit-resets',
    { grantId },
    { headers: { [IDEMPOTENCY_KEY_HEADER]: `agi.usage.reset.${Crypto.randomUUID()}` } },
  );
}

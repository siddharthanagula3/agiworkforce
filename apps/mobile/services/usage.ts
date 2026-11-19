import * as Crypto from 'expo-crypto';
import { IDEMPOTENCY_KEY_HEADER } from '@agiworkforce/cloud-contracts';
import { api } from './api';
import type { CloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';
import {
  creditsFromMicrousd,
  managedUsageBucketLabel,
  parseAccountUsageHistoryResponse,
  parseAccountUsageLimitsResponse,
  parseManagedUsageSummaryResponse,
  type AccountUsageLimitsResponse,
  type AccountUsageHistoryGranularity,
  type AccountUsageHistoryResponse,
  type ManagedUsageBucket,
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

interface UsageWindowLeft {
  bucket: ManagedUsageBucket;
  left: number;
}

export function tightestUsageWindow(snapshot: UsageSnapshot): string | null {
  const windows: UsageWindowLeft[] = [];
  if (snapshot.sessionResetAt !== null) {
    windows.push({ bucket: 'session', left: percentLeft(snapshot.sessionUsagePercentage) });
  }
  if (snapshot.weeklyResetAt !== null) {
    windows.push({ bucket: 'weekly', left: percentLeft(snapshot.weeklyUsagePercentage) });
  }
  if (windows.length === 0 && snapshot.usageResetAt !== null) {
    windows.push({ bucket: 'period', left: percentLeft(snapshot.usagePercentage) });
  }
  const tightest = windows.reduce<UsageWindowLeft | null>(
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

const BILLING_OVERAGE_PATH = '/api/billing/overage';

export interface UsageOverage {
  enabled: boolean;
  availableCredits: number;
}

function parseUsageOverage(body: unknown): UsageOverage {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const { enabled, available_microusd: availableMicrousd } = record;
  if (
    typeof enabled !== 'boolean' ||
    typeof availableMicrousd !== 'number' ||
    !Number.isFinite(availableMicrousd) ||
    availableMicrousd < 0
  ) {
    throw new Error('The usage credits setting could not be read.');
  }
  return { enabled, availableCredits: creditsFromMicrousd(availableMicrousd) };
}

export async function fetchUsageOverage(): Promise<UsageOverage> {
  return parseUsageOverage(await api.get<unknown>(BILLING_OVERAGE_PATH));
}

export async function saveUsageOverage(
  enabled: boolean,
  account: CloudAccountEpoch | null,
): Promise<UsageOverage> {
  return parseUsageOverage(
    await api.put<unknown>(BILLING_OVERAGE_PATH, { enabled }, { accountEpoch: account }),
  );
}

export interface CloudFileBreakdown {
  documentsBytes: number;
  imagesBytes: number;
}

function byteCountOf(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function fetchCloudFileBreakdown(): Promise<CloudFileBreakdown | null> {
  const page = await fetchLibraryPage({ limit: 1 });
  const documentsBytes = byteCountOf(page.storageDocumentsBytes);
  const imagesBytes = byteCountOf(page.storageImagesBytes);
  return documentsBytes === null || imagesBytes === null ? null : { documentsBytes, imagesBytes };
}

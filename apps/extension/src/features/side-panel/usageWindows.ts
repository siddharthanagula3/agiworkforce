import {
  formatCreditWindowUsage,
  formatCredits,
  formatUsageRemaining,
  getNextUpgradeTier,
  isSelfServeIndividualPlanTier,
  managedUsageBucketLabel,
  selectUsageWarning,
  type ManagedUsageBucket,
  type ManagedUsageBucketReading,
  type ManagedUsageCreditWindow,
  type ManagedUsageSummaryResponse,
  type ManagedUsageWarning,
} from '@agiworkforce/types';
import type {
  ManagedQuotaRecovery,
  ManagedQuotaWarningScope,
  ManagedQuotaWarningSignal,
} from '../cloud-bridge/freeTrialClient';

export interface UsageWindowView {
  bucket: ManagedUsageBucket;
  label: string;
  detail: string;
  usedPercent: number;
  resetAt: string | null;
  exhausted: boolean;
  reading: ManagedUsageBucketReading;
}

export interface PurchasedCreditsView {
  balance: string | null;
  overageEnabled: boolean;
  spendable: boolean;
}

const QUOTA_CODE_BUCKET: Readonly<Record<string, ManagedUsageBucket>> = Object.freeze({
  rolling_five_hour_limit_reached: 'session',
  rolling_weekly_limit_reached: 'weekly',
  flagship_weekly_limit_reached: 'weeklyFlagship',
  insufficient_credits: 'period',
  monthly_limit_exceeded: 'period',
  monthly_credit_limit_reached: 'period',
});

const WARNING_SCOPE_BUCKET: Readonly<Record<ManagedQuotaWarningScope, ManagedUsageBucket>> =
  Object.freeze({
    billing_period: 'period',
    rolling_five_hour: 'session',
    rolling_weekly: 'weekly',
  });

function creditWindowView(
  bucket: ManagedUsageBucket,
  window: ManagedUsageCreditWindow,
): UsageWindowView {
  const usedPercent =
    window.allowance > 0 ? Math.min(100, (window.used / window.allowance) * 100) : 0;
  return {
    bucket,
    label: managedUsageBucketLabel(bucket),
    detail: formatCreditWindowUsage(window.used, window.allowance),
    usedPercent,
    resetAt: window.reset_at,
    exhausted: window.allowance > 0 && window.remaining <= 0,
    reading: {
      bucket,
      percentRemaining: 100 - usedPercent,
      resetAt: window.reset_at,
      allowanceCredits: window.allowance,
      usedCredits: window.used,
    },
  };
}

function percentWindowView(
  bucket: ManagedUsageBucket,
  usagePercentage: number,
  resetAt: string | null,
): UsageWindowView {
  const usedPercent = Math.min(100, Math.max(0, usagePercentage));
  return {
    bucket,
    label: managedUsageBucketLabel(bucket),
    detail: formatUsageRemaining(100 - usedPercent),
    usedPercent,
    resetAt,
    exhausted: usedPercent >= 100,
    reading: { bucket, percentRemaining: 100 - usedPercent, resetAt },
  };
}

export function usageWindowViews(usage: ManagedUsageSummaryResponse): UsageWindowView[] {
  const credits = usage.credits;
  if (credits) {
    return [
      creditWindowView('session', credits.five_hour),
      creditWindowView('weekly', credits.weekly),
      ...(credits.flagship_weekly
        ? [creditWindowView('weeklyFlagship', credits.flagship_weekly)]
        : []),
      creditWindowView('period', credits.monthly),
    ];
  }
  return [
    percentWindowView('session', usage.session_usage_percentage, usage.session_reset_at),
    percentWindowView('weekly', usage.weekly_usage_percentage, usage.weekly_reset_at),
    percentWindowView('period', usage.usage_percentage, usage.usage_reset_at),
  ];
}

export function purchasedCreditsView(
  usage: ManagedUsageSummaryResponse,
): PurchasedCreditsView | null {
  const purchased = usage.credits?.purchased;
  if (!purchased) return null;
  return {
    balance: purchased.remaining === null ? null : formatCredits(purchased.remaining),
    overageEnabled: purchased.overage_enabled,
    spendable: purchased.overage_enabled && (purchased.remaining ?? 0) > 0,
  };
}

function resetTime(view: UsageWindowView): number {
  const time = view.resetAt ? Date.parse(view.resetAt) : Number.NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function blockingUsageWindow(views: readonly UsageWindowView[]): UsageWindowView | null {
  let binding: UsageWindowView | null = null;
  for (const view of views) {
    if (!view.exhausted || view.bucket === 'weeklyFlagship') continue;
    if (!binding || resetTime(view) > resetTime(binding)) binding = view;
  }
  return binding;
}

export function usageLimitNotice(
  view: UsageWindowView,
  now: number = Date.now(),
): ManagedUsageWarning | null {
  return selectUsageWarning([{ ...view.reading, percentRemaining: 0 }], now);
}

export function usageWarning(
  views: readonly UsageWindowView[],
  now: number = Date.now(),
): ManagedUsageWarning | null {
  return selectUsageWarning(
    views.map((view) => view.reading),
    now,
  );
}

export function quotaBlockWindow(
  views: readonly UsageWindowView[],
  quotaCode: string,
): UsageWindowView | null {
  const bucket = QUOTA_CODE_BUCKET[quotaCode];
  const named = bucket ? views.find((view) => view.bucket === bucket) : undefined;
  return named ?? blockingUsageWindow(views);
}

export function quotaWarningFromSignal(
  views: readonly UsageWindowView[],
  signal: ManagedQuotaWarningSignal,
  now: number = Date.now(),
): ManagedUsageWarning | null {
  const bucket = WARNING_SCOPE_BUCKET[signal.scope];
  const view = views.find((candidate) => candidate.bucket === bucket);
  const allowanceCredits = view?.reading.allowanceCredits;
  return selectUsageWarning(
    [
      {
        bucket,
        percentRemaining: 100 - signal.usedPercent,
        resetAt: view?.resetAt ?? null,
        ...(allowanceCredits !== undefined ? { allowanceCredits } : {}),
      },
    ],
    now,
  );
}

export function describeUsageNotice(notice: ManagedUsageWarning): string {
  return notice.resetLabel ? `${notice.headline}. ${notice.resetLabel}.` : `${notice.headline}.`;
}

export function planQuotaRecovery(planTier: string): ManagedQuotaRecovery {
  if (isSelfServeIndividualPlanTier(planTier)) {
    return { action: 'top_up', href: '/settings/billing' };
  }
  if (getNextUpgradeTier(planTier) !== null) return { action: 'upgrade', href: '/pricing' };
  return { action: 'view_usage', href: '/settings/usage' };
}

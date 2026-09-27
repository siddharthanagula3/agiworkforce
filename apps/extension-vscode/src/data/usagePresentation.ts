import {
  MANAGED_USAGE_BUCKET_ORDER,
  formatCreditWindowUsage,
  formatCredits,
  formatUsageResetIn,
  managedUsageBucketLabel,
  usageWorkloadLabel,
  type ManagedUsageBucket,
  type ManagedUsageCreditWindow,
  type ManagedUsageCredits,
} from '@agiworkforce/types';
import type { UsageHistory } from '../protocol/apiResponses';
import { modelDisplayLabel } from '../features/model-picker/modelConstants';

export interface CreditWindowRow {
  bucket: ManagedUsageBucket;
  label: string;
  usage: string;
  reset: string | null;
  usedPercent: number;
}

export interface UsageHistoryRow {
  label: string;
  credits: string;
  requests: string;
}

export interface UsageHistorySummary {
  rangeLabel: string;
  total: string;
  totalRequests: string;
  byWorkload: UsageHistoryRow[];
  byModel: UsageHistoryRow[];
  periodCaption: string;
  byPeriod: UsageHistoryRow[];
  unsettled: string | null;
}

const HISTORY_MODEL_LIMIT = 8;
const HISTORY_PERIOD_LIMIT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function creditWindowFor(
  credits: ManagedUsageCredits,
  bucket: ManagedUsageBucket,
): ManagedUsageCreditWindow | null {
  switch (bucket) {
    case 'session':
      return credits.five_hour;
    case 'weekly':
      return credits.weekly;
    case 'weeklyFlagship':
      return credits.flagship_weekly;
    case 'period':
      return credits.monthly;
  }
}

export function creditWindowRows(
  credits: ManagedUsageCredits,
  nowMs: number = Date.now(),
): CreditWindowRow[] {
  return MANAGED_USAGE_BUCKET_ORDER.flatMap((bucket) => {
    const window = creditWindowFor(credits, bucket);
    if (window === null || window.allowance <= 0) return [];
    return [
      {
        bucket,
        label: managedUsageBucketLabel(bucket),
        usage: formatCreditWindowUsage(window.used, window.allowance),
        reset: formatUsageResetIn(window.reset_at, nowMs),
        usedPercent: Math.min(100, Math.round((window.used / window.allowance) * 100)),
      },
    ];
  });
}

function requestCount(requests: number): string {
  return `${requests.toLocaleString()} ${requests === 1 ? 'request' : 'requests'}`;
}

function historyRow(label: string, requests: number, credits: number): UsageHistoryRow {
  return {
    label,
    credits: formatCredits(credits),
    requests: requestCount(requests),
  };
}

const PERIOD_CAPTIONS: Readonly<Record<UsageHistory['granularity'], string>> = {
  day: 'By day',
  week: 'By week',
  month: 'By month',
};

function periodLabel(start: string, granularity: UsageHistory['granularity']): string {
  const date = new Date(start);
  if (granularity === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return granularity === 'week' ? `Week of ${day}` : day;
}

export function summarizeUsageHistory(history: UsageHistory): UsageHistorySummary {
  const days = Math.max(
    1,
    Math.round((Date.parse(history.to) - Date.parse(history.from)) / DAY_MS),
  );
  const unsettled = history.freshness.unsettledRequests;
  return {
    rangeLabel: `last ${days} ${days === 1 ? 'day' : 'days'}`,
    total: formatCredits(history.totals.credits),
    totalRequests: requestCount(history.totals.requests),
    byWorkload: history.byWorkload.map((row) =>
      historyRow(row.label ?? usageWorkloadLabel(row.key), row.requests, row.credits),
    ),
    byModel: history.byModel
      .slice(0, HISTORY_MODEL_LIMIT)
      .map((row) => historyRow(row.label ?? modelDisplayLabel(row.key), row.requests, row.credits)),
    periodCaption: PERIOD_CAPTIONS[history.granularity],
    byPeriod: history.periods
      .slice(-HISTORY_PERIOD_LIMIT)
      .reverse()
      .map((row) =>
        historyRow(periodLabel(row.start, history.granularity), row.requests, row.credits),
      ),
    unsettled:
      unsettled > 0
        ? `${unsettled.toLocaleString()} ${unsettled === 1 ? 'turn is' : 'turns are'} still settling and not counted yet`
        : null,
  };
}

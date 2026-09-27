import {
  MANAGED_USAGE_BUCKET_ORDER,
  creditsFromCents,
  formatCreditWindowUsage,
  formatCredits,
  formatUsageResetIn,
  managedUsageBucketLabel,
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
  byModel: UsageHistoryRow[];
  byDay: UsageHistoryRow[];
  unsettled: string | null;
}

const HISTORY_MODEL_LIMIT = 8;
const HISTORY_DAY_LIMIT = 14;
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

function historyRow(label: string, requests: number, costCents: number): UsageHistoryRow {
  return {
    label,
    credits: formatCredits(creditsFromCents(costCents)),
    requests: requestCount(requests),
  };
}

export function summarizeUsageHistory(history: UsageHistory): UsageHistorySummary {
  const days = Math.max(
    1,
    Math.round((Date.parse(history.to) - Date.parse(history.from)) / DAY_MS),
  );
  const unsettled = history.freshness.unsettledRequests;
  return {
    rangeLabel: `last ${days} ${days === 1 ? 'day' : 'days'}`,
    total: formatCredits(creditsFromCents(history.totals.costCents)),
    totalRequests: requestCount(history.totals.requests),
    byModel: history.byModel
      .slice(0, HISTORY_MODEL_LIMIT)
      .map((row) => historyRow(modelDisplayLabel(row.key), row.requests, row.costCents)),
    byDay: history.daily
      .slice(-HISTORY_DAY_LIMIT)
      .reverse()
      .map((row) =>
        historyRow(
          new Date(row.day).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          }),
          row.requests,
          row.costCents,
        ),
      ),
    unsettled:
      unsettled > 0
        ? `${unsettled.toLocaleString()} ${unsettled === 1 ? 'turn is' : 'turns are'} still settling and not counted yet`
        : null,
  };
}

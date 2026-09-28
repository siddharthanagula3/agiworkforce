import {
  ACCOUNT_USAGE_HISTORY_GRANULARITIES,
  MONTHLY_METERED_UNITS,
  type AccountUsageHistoryGranularity,
  type MonthlyMeteredUnit,
} from './account-usage-client';

export interface AccountUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
}

export interface AccountUsageBreakdownRow extends AccountUsageTotals {
  key: string;
  label: string | null;
}

export interface AccountUsagePeriodRow {
  start: string;
  requests: number;
  credits: number;
}

export interface AccountUsageFreshness {
  asOf: string;
  latestActivityAt: string | null;
  unsettledRequests: number;
}

export interface AccountUsageHistoryResponse {
  userId: string;
  from: string;
  to: string;
  granularity: AccountUsageHistoryGranularity;
  totals: AccountUsageTotals;
  periods: AccountUsagePeriodRow[];
  byWorkload: AccountUsageBreakdownRow[];
  byModel: AccountUsageBreakdownRow[];
  byProject: AccountUsageBreakdownRow[];
  freshness: AccountUsageFreshness;
}

export interface TierUnitAllowance {
  hardLimit: number | null;
  softLimit: number | null;
}

export interface TierUnitUsage extends TierUnitAllowance {
  unit: MonthlyMeteredUnit;
  consumed: number;
}

export interface MonthlyImageUsage {
  images: number;
  requests: number;
  credits: number;
}

export interface ManagedTurnSlotReading {
  limit: number;
  active: number;
}

export interface AccountUsageLimitsResponse {
  planTier: string;
  periodStart: string;
  resetAt: string;
  units: TierUnitUsage[];
  images: MonthlyImageUsage;
  responses: ManagedTurnSlotReading | null;
}

export interface ManagedUsageTurnCost {
  requestId: string;
  status: 'settled' | 'pending';
  credits: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function readBreakdownRows(value: unknown): AccountUsageBreakdownRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) =>
    isRecord(row) &&
    typeof row['key'] === 'string' &&
    isFiniteNumber(row['requests']) &&
    isFiniteNumber(row['credits'])
      ? [
          {
            key: row['key'],
            label: typeof row['label'] === 'string' ? row['label'] : null,
            requests: row['requests'],
            inputTokens: finiteOr(row['inputTokens'], 0),
            outputTokens: finiteOr(row['outputTokens'], 0),
            credits: row['credits'],
          },
        ]
      : [],
  );
}

export function parseAccountUsageHistoryResponse(
  value: unknown,
): AccountUsageHistoryResponse | null {
  if (!isRecord(value) || !isRecord(value['totals'])) return null;
  const totals = value['totals'];
  const granularity = ACCOUNT_USAGE_HISTORY_GRANULARITIES.find(
    (entry) => entry === value['granularity'],
  );
  if (!granularity || !isFiniteNumber(totals['requests']) || !isFiniteNumber(totals['credits'])) {
    return null;
  }
  const freshness = isRecord(value['freshness']) ? value['freshness'] : {};
  const periods = Array.isArray(value['periods']) ? value['periods'] : [];
  return {
    userId: typeof value['userId'] === 'string' ? value['userId'] : '',
    from: typeof value['from'] === 'string' ? value['from'] : '',
    to: typeof value['to'] === 'string' ? value['to'] : '',
    granularity,
    totals: {
      requests: totals['requests'],
      inputTokens: finiteOr(totals['inputTokens'], 0),
      outputTokens: finiteOr(totals['outputTokens'], 0),
      credits: totals['credits'],
    },
    periods: periods.flatMap((period) =>
      isRecord(period) &&
      typeof period['start'] === 'string' &&
      isFiniteNumber(period['requests']) &&
      isFiniteNumber(period['credits'])
        ? [{ start: period['start'], requests: period['requests'], credits: period['credits'] }]
        : [],
    ),
    byWorkload: readBreakdownRows(value['byWorkload']),
    byModel: readBreakdownRows(value['byModel']),
    byProject: readBreakdownRows(value['byProject']),
    freshness: {
      asOf: typeof freshness['asOf'] === 'string' ? freshness['asOf'] : '',
      latestActivityAt:
        typeof freshness['latestActivityAt'] === 'string' ? freshness['latestActivityAt'] : null,
      unsettledRequests: finiteOr(freshness['unsettledRequests'], 0),
    },
  };
}

export function parseAccountUsageLimitsResponse(value: unknown): AccountUsageLimitsResponse | null {
  if (!isRecord(value) || !Array.isArray(value['units']) || !isRecord(value['images'])) return null;
  const images = value['images'];
  if (typeof value['resetAt'] !== 'string' || !isFiniteNumber(images['images'])) return null;
  const responses = value['responses'];
  return {
    planTier: typeof value['planTier'] === 'string' ? value['planTier'] : '',
    periodStart: typeof value['periodStart'] === 'string' ? value['periodStart'] : '',
    resetAt: value['resetAt'],
    units: value['units'].flatMap((unit) => {
      if (!isRecord(unit) || !isFiniteNumber(unit['consumed'])) return [];
      const kind = MONTHLY_METERED_UNITS.find((entry) => entry === unit['unit']);
      return kind
        ? [
            {
              unit: kind,
              consumed: unit['consumed'],
              hardLimit: isFiniteNumber(unit['hardLimit']) ? unit['hardLimit'] : null,
              softLimit: isFiniteNumber(unit['softLimit']) ? unit['softLimit'] : null,
            },
          ]
        : [];
    }),
    images: {
      images: images['images'],
      requests: finiteOr(images['requests'], 0),
      credits: finiteOr(images['credits'], 0),
    },
    responses:
      isRecord(responses) &&
      isFiniteNumber(responses['limit']) &&
      isFiniteNumber(responses['active'])
        ? { limit: responses['limit'], active: responses['active'] }
        : null,
  };
}

export function parseManagedUsageTurnCost(value: unknown): ManagedUsageTurnCost | null {
  if (!isRecord(value)) return null;
  const requestId = typeof value['requestId'] === 'string' ? value['requestId'] : '';
  if (value['status'] === 'pending') return { requestId, status: 'pending', credits: null };
  if (value['status'] === 'settled' && isFiniteNumber(value['credits'])) {
    return { requestId, status: 'settled', credits: value['credits'] };
  }
  return null;
}

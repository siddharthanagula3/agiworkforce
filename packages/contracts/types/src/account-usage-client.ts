export const ACCOUNT_USAGE_HISTORY_GRANULARITIES = ['day', 'week', 'month'] as const;
export type AccountUsageHistoryGranularity = (typeof ACCOUNT_USAGE_HISTORY_GRANULARITIES)[number];

export interface AccountUsageHistoryRow {
  key: string;
  label: string | null;
  requests: number;
  credits: number;
}

export interface AccountUsageHistoryPeriod {
  start: string;
  requests: number;
  credits: number;
}

export interface AccountUsageHistorySummary {
  granularity: AccountUsageHistoryGranularity;
  from: string;
  to: string;
  totals: { requests: number; credits: number };
  periods: AccountUsageHistoryPeriod[];
  byWorkload: AccountUsageHistoryRow[];
  byModel: AccountUsageHistoryRow[];
  unsettledRequests: number;
}

export const MONTHLY_METERED_UNITS = [
  'voice_minutes',
  'video_seconds',
  'computer_use_requests',
] as const;
export type MonthlyMeteredUnit = (typeof MONTHLY_METERED_UNITS)[number];

export const MONTHLY_METERED_UNIT_COPY: Readonly<
  Record<MonthlyMeteredUnit, { label: string; one: string; many: string }>
> = {
  voice_minutes: { label: 'Voice', one: 'minute', many: 'minutes' },
  video_seconds: { label: 'Video', one: 'second', many: 'seconds' },
  computer_use_requests: { label: 'Computer use', one: 'request', many: 'requests' },
};

export interface AccountUsageAllowanceUnit {
  unit: MonthlyMeteredUnit;
  consumed: number;
  hardLimit: number | null;
}

export interface AccountUsageAllowances {
  resetAt: string;
  units: AccountUsageAllowanceUnit[];
  images: { images: number; requests: number; credits: number };
  responses: { active: number; limit: number } | null;
  storage: { usedBytes: number | null; limitBytes: number | null } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isGranularity(value: unknown): value is AccountUsageHistoryGranularity {
  return (ACCOUNT_USAGE_HISTORY_GRANULARITIES as readonly unknown[]).includes(value);
}

function isMonthlyMeteredUnit(value: unknown): value is MonthlyMeteredUnit {
  return (MONTHLY_METERED_UNITS as readonly unknown[]).includes(value);
}

function readRows(value: unknown): AccountUsageHistoryRow[] {
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
            credits: row['credits'],
          },
        ]
      : [],
  );
}

export function parseAccountUsageHistory(value: unknown): AccountUsageHistorySummary | null {
  if (!isRecord(value) || !isRecord(value['totals'])) return null;
  const totals = value['totals'];
  const granularity = value['granularity'];
  if (!isGranularity(granularity)) return null;
  if (!isFiniteNumber(totals['requests']) || !isFiniteNumber(totals['credits'])) return null;
  const freshness = isRecord(value['freshness']) ? value['freshness'] : {};
  const periods = Array.isArray(value['periods']) ? value['periods'] : [];
  return {
    granularity,
    from: typeof value['from'] === 'string' ? value['from'] : '',
    to: typeof value['to'] === 'string' ? value['to'] : '',
    totals: { requests: totals['requests'], credits: totals['credits'] },
    periods: periods.flatMap((period) =>
      isRecord(period) &&
      typeof period['start'] === 'string' &&
      isFiniteNumber(period['requests']) &&
      isFiniteNumber(period['credits'])
        ? [{ start: period['start'], requests: period['requests'], credits: period['credits'] }]
        : [],
    ),
    byWorkload: readRows(value['byWorkload']),
    byModel: readRows(value['byModel']),
    unsettledRequests: isFiniteNumber(freshness['unsettledRequests'])
      ? freshness['unsettledRequests']
      : 0,
  };
}

export function parseAccountUsageAllowances(value: unknown): AccountUsageAllowances | null {
  if (!isRecord(value) || !Array.isArray(value['units']) || !isRecord(value['images'])) return null;
  const images = value['images'];
  if (typeof value['resetAt'] !== 'string' || !isFiniteNumber(images['images'])) return null;
  const responses = value['responses'];
  const storage = value['storage'];
  return {
    resetAt: value['resetAt'],
    units: value['units'].flatMap((unit) =>
      isRecord(unit) && isMonthlyMeteredUnit(unit['unit']) && isFiniteNumber(unit['consumed'])
        ? [
            {
              unit: unit['unit'],
              consumed: unit['consumed'],
              hardLimit: isFiniteNumber(unit['hardLimit']) ? unit['hardLimit'] : null,
            },
          ]
        : [],
    ),
    images: {
      images: images['images'],
      requests: isFiniteNumber(images['requests']) ? images['requests'] : 0,
      credits: isFiniteNumber(images['credits']) ? images['credits'] : 0,
    },
    responses:
      isRecord(responses) &&
      isFiniteNumber(responses['active']) &&
      isFiniteNumber(responses['limit'])
        ? { active: responses['active'], limit: responses['limit'] }
        : null,
    storage: isRecord(storage)
      ? {
          usedBytes: isFiniteNumber(storage['usedBytes']) ? storage['usedBytes'] : null,
          limitBytes: isFiniteNumber(storage['limitBytes']) ? storage['limitBytes'] : null,
        }
      : null,
  };
}

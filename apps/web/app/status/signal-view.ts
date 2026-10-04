import type { HealthCheckResult } from '@/lib/server/health-check';
import { RENDER_CACHE_SECONDS } from '@/lib/server/render-cache';

type Checks = HealthCheckResult['checks'];

export type CheckKey = keyof Checks;
export type ReportedState = HealthCheckResult['status'];
export type SignalState = ReportedState | 'stale' | 'unknown';

export interface HealthSignal {
  state: ReportedState | 'unknown';
  checkedAt: string | null;
  checks: Checks | null;
}

export interface CheckRow {
  key: CheckKey;
  label: string;
}

export interface ViewedCheck<Row extends CheckRow> {
  row: Row;
  check: Checks[CheckKey];
}

export interface SignalView<Row extends CheckRow> {
  state: SignalState;
  reported: ReportedState | null;
  checkedAtMs: number | null;
  ageSeconds: number | null;
  rows: ViewedCheck<Row>[];
  failing: string[];
}

const STALE_AFTER_WINDOWS = 2;
const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

export const STALE_AFTER_SECONDS = STALE_AFTER_WINDOWS * RENDER_CACHE_SECONDS.liveSignal;

function isFailing(check: Checks[CheckKey]): boolean {
  return check.status !== 'healthy';
}

export function viewSignal<Row extends CheckRow>(
  signal: HealthSignal,
  nowMs: number,
  rows: readonly Row[],
): SignalView<Row> {
  const checks = signal.checks;
  const checkedAtMs = signal.checkedAt === null ? Number.NaN : Date.parse(signal.checkedAt);

  if (signal.state === 'unknown' || checks === null || Number.isNaN(checkedAtMs)) {
    return {
      state: 'unknown',
      reported: null,
      checkedAtMs: null,
      ageSeconds: null,
      rows: [],
      failing: [],
    };
  }

  const viewed = rows.map((row) => ({ row, check: checks[row.key] }));
  const failingRows = viewed.filter(({ check }) => isFailing(check));
  const passingRows = viewed.filter(({ check }) => !isFailing(check));
  const ageMs = Math.max(0, nowMs - checkedAtMs);

  return {
    state: ageMs > STALE_AFTER_SECONDS * MS_PER_SECOND ? 'stale' : signal.state,
    reported: signal.state,
    checkedAtMs,
    ageSeconds: Math.floor(ageMs / MS_PER_SECOND),
    rows: [...failingRows, ...passingRows],
    failing: failingRows.map(({ row }) => row.label),
  };
}

export function formatAge(ageSeconds: number): string {
  const minutes = Math.floor(ageSeconds / SECONDS_PER_MINUTE);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`;

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) {
    const rest = minutes % MINUTES_PER_HOUR;
    return rest === 0 ? `${hours} h ago` : `${hours} h ${rest} min ago`;
  }

  const days = Math.floor(hours / HOURS_PER_DAY);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

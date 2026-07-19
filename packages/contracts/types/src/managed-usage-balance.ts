/** Public managed-usage status. Private allocations and ledger units stay server-side. */
export interface ManagedUsageBalance {
  /** Percentage of the active plan allowance already used (0–100). */
  usage_percentage: number;
  /** When the active allowance resets. Free uses its rolling daily window. */
  reset_at: string | null;
  /** Whole seconds until the active allowance resets. */
  seconds_until_reset: number;
  /** Whether another managed request may be admitted under the active allowance. */
  has_usage_remaining: boolean;
}

export interface ManagedUsageSubscription {
  plan_tier: string;
  status: string;
  current_period_end: string | null;
}

export interface ManagedUsageBalanceResponse {
  object: 'credit_balance';
  subscription: ManagedUsageSubscription;
  credits: ManagedUsageBalance;
}

/** Percentage-only response from `/api/usage`. */
export interface ManagedUsageSummaryResponse {
  plan_tier: string;
  usage_percentage: number;
  usage_reset_at: string | null;
  has_usage_remaining: boolean;
  period_start: string | null;
  period_end: string | null;
  subscription_status: string;
  session_usage_percentage: number;
  session_reset_at: string | null;
  weekly_usage_percentage: number;
  weekly_reset_at: string | null;
  flagship_weekly_usage_percentage: number;
  flagship_weekly_reset_at: string | null;
}

export function normalizeUsagePercentage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${key} must be a non-empty string`);
  }
  return value;
}

function readNullableTimestamp(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${key} must be an ISO timestamp or null`);
  }
  return value;
}

function readPercentage(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`${key} must be a percentage from 0 to 100`);
  }
  return value;
}

/** Validate and project a public summary, dropping every non-contract field. */
export function parseManagedUsageSummaryResponse(value: unknown): ManagedUsageSummaryResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('managed usage summary must be an object');
  }
  const record = value as Record<string, unknown>;
  if (typeof record['has_usage_remaining'] !== 'boolean') {
    throw new TypeError('has_usage_remaining must be a boolean');
  }

  return {
    plan_tier: readString(record, 'plan_tier'),
    usage_percentage: readPercentage(record, 'usage_percentage'),
    usage_reset_at: readNullableTimestamp(record, 'usage_reset_at'),
    has_usage_remaining: record['has_usage_remaining'],
    period_start: readNullableTimestamp(record, 'period_start'),
    period_end: readNullableTimestamp(record, 'period_end'),
    subscription_status: readString(record, 'subscription_status'),
    session_usage_percentage: readPercentage(record, 'session_usage_percentage'),
    session_reset_at: readNullableTimestamp(record, 'session_reset_at'),
    weekly_usage_percentage: readPercentage(record, 'weekly_usage_percentage'),
    weekly_reset_at: readNullableTimestamp(record, 'weekly_reset_at'),
    flagship_weekly_usage_percentage: readPercentage(record, 'flagship_weekly_usage_percentage'),
    flagship_weekly_reset_at: readNullableTimestamp(record, 'flagship_weekly_reset_at'),
  };
}

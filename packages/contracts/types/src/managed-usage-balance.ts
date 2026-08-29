export interface ManagedUsageBalance {
  usage_percentage: number | null;
  reset_at: string | null;
  seconds_until_reset: number;
  has_usage_remaining: boolean;
  usage_visible: boolean;
  usage_allocation?: 'provisioned' | 'pending';
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
  credit_balance_cents?: number | null;
  overage_enabled?: boolean;
  /**
   * Distinguishes an allocation that was spent from one that was never granted.
   * `toPublicUsagePercentage` returns 0 for both, so without this a subscriber
   * whose credit account has not been provisioned reads as 0% used and out of
   * budget at the same time.
   */
  usage_allocation?: 'provisioned' | 'pending';
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

function readNullableCents(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${key} must be a non-negative whole number of cents or null`);
  }
  return value;
}

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
    ...(record['credit_balance_cents'] === undefined
      ? {}
      : { credit_balance_cents: readNullableCents(record, 'credit_balance_cents') }),
    ...(record['overage_enabled'] === undefined
      ? {}
      : { overage_enabled: record['overage_enabled'] === true }),
  };
}

export const ACCOUNT_USAGE_HISTORY_GRANULARITIES = ['day', 'week', 'month'] as const;
export type AccountUsageHistoryGranularity = (typeof ACCOUNT_USAGE_HISTORY_GRANULARITIES)[number];

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

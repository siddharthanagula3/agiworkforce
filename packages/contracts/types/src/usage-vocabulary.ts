export type ManagedUsageBucket = 'session' | 'weekly' | 'weeklyFlagship' | 'period';

export interface ManagedUsageBucketCopy {
  label: string;
  description: string;
  limitPhrase: string;
}

export const MANAGED_USAGE_BUCKET_COPY: Readonly<
  Record<ManagedUsageBucket, ManagedUsageBucketCopy>
> = Object.freeze({
  session: {
    label: 'Current session',
    description: 'Refills continuously as earlier usage ages out.',
    limitPhrase: 'your current session limit',
  },
  weekly: {
    label: 'This week',
    description: 'Across every model, refilling as the week rolls forward.',
    limitPhrase: 'your weekly limit',
  },
  weeklyFlagship: {
    label: 'Most capable models',
    description: 'A share of the weekly allowance reserved for the largest models.',
    limitPhrase: 'your weekly limit for the most capable models',
  },
  period: {
    label: 'This billing period',
    description: 'Resets on your billing date.',
    limitPhrase: 'your limit for this billing period',
  },
});

export const MANAGED_USAGE_BUCKET_ORDER: readonly ManagedUsageBucket[] = Object.freeze([
  'session',
  'weekly',
  'weeklyFlagship',
  'period',
]);

export function managedUsageBucketLabel(bucket: ManagedUsageBucket): string {
  return MANAGED_USAGE_BUCKET_COPY[bucket].label;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatUsageResetIn(
  resetAt: string | number | Date | null | undefined,
  now: number = Date.now(),
): string | null {
  if (resetAt === null || resetAt === undefined) return null;

  const target = resetAt instanceof Date ? resetAt.getTime() : new Date(resetAt).getTime();
  if (!Number.isFinite(target)) return null;

  const remaining = target - now;
  if (remaining <= 0) return null;

  if (remaining < HOUR_MS) {
    const minutes = Math.max(1, Math.round(remaining / MINUTE_MS));
    return `Resets in ${minutes} min`;
  }
  if (remaining < DAY_MS) {
    const hours = Math.floor(remaining / HOUR_MS);
    const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
    // Whole hours keep their existing wording so nothing that reads fine today
    // changes; minutes are added only when there are some to report.
    if (minutes === 0) return `Resets in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    return `Resets in ${hours} hr ${minutes} min`;
  }
  const days = Math.round(remaining / DAY_MS);
  return `Resets in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatUsageRemaining(percentRemaining: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percentRemaining)));
  if (clamped === 0) return 'None left';
  return `${clamped}% left`;
}

export const USAGE_WARNING_REMAINING_PERCENT = 25;

export const USAGE_CRITICAL_REMAINING_PERCENT = 10;

export interface ManagedUsageBucketReading {
  bucket: ManagedUsageBucket;
  percentRemaining: number;
  resetAt?: string | number | Date | null;
}

export interface ManagedUsageWarning {
  bucket: ManagedUsageBucket;
  severity: 'warning' | 'critical';
  percentRemaining: number;
  headline: string;
  resetLabel: string | null;
}

export function selectUsageWarning(
  readings: readonly ManagedUsageBucketReading[],
  now: number = Date.now(),
): ManagedUsageWarning | null {
  let binding: ManagedUsageBucketReading | null = null;
  let bindingRemaining = Number.POSITIVE_INFINITY;

  for (const bucket of MANAGED_USAGE_BUCKET_ORDER) {
    const reading = readings.find((candidate) => candidate.bucket === bucket);
    if (!reading || !Number.isFinite(reading.percentRemaining)) continue;
    const remaining = Math.max(0, Math.min(100, reading.percentRemaining));
    if (remaining < bindingRemaining) {
      binding = { ...reading, percentRemaining: remaining };
      bindingRemaining = remaining;
    }
  }

  if (!binding || bindingRemaining > USAGE_WARNING_REMAINING_PERCENT) return null;

  const used = Math.round(100 - bindingRemaining);
  return {
    bucket: binding.bucket,
    severity: bindingRemaining <= USAGE_CRITICAL_REMAINING_PERCENT ? 'critical' : 'warning',
    percentRemaining: bindingRemaining,
    headline:
      bindingRemaining <= 0
        ? `You've used all of ${MANAGED_USAGE_BUCKET_COPY[binding.bucket].limitPhrase}`
        : `You've used ${used}% of ${MANAGED_USAGE_BUCKET_COPY[binding.bucket].limitPhrase}`,
    resetLabel: formatUsageResetIn(binding.resetAt, now),
  };
}

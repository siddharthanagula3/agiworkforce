import { formatCredits } from './credits';

export type ManagedUsageBucket = 'session' | 'weekly' | 'weeklyFlagship' | 'period';

export interface ManagedUsageBucketCopy {
  label: string;
  description: string;
  limitPhrase: string;
  /**
   * The window a credit figure belongs to, so a limit can be stated as an
   * amount rather than a share: "your 25 credits for this 5-hour window".
   */
  creditWindowPhrase: string;
}

export const MANAGED_USAGE_BUCKET_COPY: Readonly<
  Record<ManagedUsageBucket, ManagedUsageBucketCopy>
> = Object.freeze({
  session: {
    label: 'Current session',
    description: 'Refills continuously as earlier usage ages out.',
    limitPhrase: 'your current session limit',
    creditWindowPhrase: 'for this 5-hour window',
  },
  weekly: {
    label: 'This week',
    description: 'Across every model, refilling as the week rolls forward.',
    limitPhrase: 'your weekly limit',
    creditWindowPhrase: 'for this week',
  },
  weeklyFlagship: {
    label: 'Most capable models',
    description: 'A share of the weekly allowance reserved for the largest models.',
    limitPhrase: 'your weekly limit for the most capable models',
    creditWindowPhrase: 'for the most capable models this week',
  },
  period: {
    label: 'This billing period',
    description: 'Resets on your billing date.',
    limitPhrase: 'your limit for this billing period',
    creditWindowPhrase: 'for this billing period',
  },
});

/**
 * A credit amount without its unit word, for copy that supplies its own.
 * One decimal: sub-cent metering means a turn can cost a fraction of a credit,
 * and a whole-number display would report every one of them as zero.
 */
export function creditAmount(credits: number): string {
  return Math.max(0, credits).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatCreditWindowUsage(used: number, allowance: number): string {
  const remaining = Math.max(0, allowance - used);
  return `Used ${creditAmount(used)} of ${creditAmount(allowance)} credits · ${creditAmount(remaining)} left`;
}

export function managedUsageCreditLimitPhrase(
  bucket: ManagedUsageBucket,
  allowance: number,
): string {
  return `your ${formatCredits(allowance)} ${MANAGED_USAGE_BUCKET_COPY[bucket].creditWindowPhrase}`;
}

export function formatPlanCreditAllowanceLine(
  planLabel: string,
  allowance: { monthly: number; weekly: number; fiveHour: number },
): string {
  return [
    planLabel,
    `${creditAmount(allowance.monthly)} credits/month`,
    `${creditAmount(allowance.weekly)} credits/week`,
    `${creditAmount(allowance.fiveHour)} credits per 5 hours`,
  ].join(' · ');
}

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
    // Hours AND minutes, floored, not hours rounded.
    //
    // Rounding turned 3h54m into "4 hours" and 3h29m into "3 hours", the
    // second understates the wait by half an hour, and someone planning around
    // a quota reset comes back to find it has not happened. Flooring can only
    // understate by under a minute, and the extra precision is what a person
    // deciding whether to wait actually needs.
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
  /**
   * Present once the server states the window in credits. The percentage stays
   * the selector's input, so a server that cannot name an allowance still
   * produces a warning, in the older share-based wording.
   */
  allowanceCredits?: number;
  usedCredits?: number;
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
    headline: usageWarningHeadline(binding, bindingRemaining, used),
    resetLabel: formatUsageResetIn(binding.resetAt, now),
  };
}

function usageWarningHeadline(
  reading: ManagedUsageBucketReading,
  percentRemaining: number,
  usedPercent: number,
): string {
  const allowance = reading.allowanceCredits;
  if (typeof allowance === 'number' && Number.isFinite(allowance) && allowance > 0) {
    const limit = managedUsageCreditLimitPhrase(reading.bucket, allowance);
    if (percentRemaining <= 0) return `You have used ${limit}`;
    const usedCredits = reading.usedCredits;
    const consumed =
      typeof usedCredits === 'number' && Number.isFinite(usedCredits)
        ? usedCredits
        : (allowance * usedPercent) / 100;
    return `You have used ${creditAmount(consumed)} of ${limit}`;
  }
  return percentRemaining <= 0
    ? `You've used all of ${MANAGED_USAGE_BUCKET_COPY[reading.bucket].limitPhrase}`
    : `You've used ${usedPercent}% of ${MANAGED_USAGE_BUCKET_COPY[reading.bucket].limitPhrase}`;
}

/**
 * usage-vocabulary.ts — the one set of words for managed-usage quota buckets.
 *
 * The server meters four buckets. Every surface named them differently:
 *
 *   web      "Rolling 5 hours" · "Rolling 7 days" · "Most capable models · 7 days" · "Account month"
 *   mobile   "Current session" · "Weekly limits > All models / Flagship models" · "This period"
 *   desktop  "Token Budget Usage", raw token counts and an estimated dollar cost
 *   chrome   a single "Cloud usage" percentage
 *
 * Same numbers, four vocabularies — so a user who checks their usage on the
 * phone and again on the web cannot tell whether they are looking at the same
 * limit. "Rolling 5 hours" also describes the MECHANISM rather than the thing
 * the user cares about, which is whether they can keep working right now.
 *
 * The mobile wording won: it says what the bucket means rather than how it is
 * computed, and it matches the reference products. This module is deliberately
 * dependency-free and platform-neutral so React Native, the web app, the
 * Electron/Tauri shells and the Chrome side panel can all import it — a shared
 * React component could not serve mobile.
 *
 * Reset times are formatted here too, for the same reason: web said
 * "Capacity refreshes in 3 hours (Jul 26, 4:00 PM)" while mobile said
 * "Resets in 3 hr 27 min" for the identical timestamp.
 */

/** The four metered buckets, in the order they should be presented. */
export type ManagedUsageBucket = 'session' | 'weekly' | 'weeklyFlagship' | 'period';

export interface ManagedUsageBucketCopy {
  /** Short label for the meter row. */
  label: string;
  /** One line explaining what the bucket actually governs. */
  description: string;
  /**
   * The bucket named inside a sentence, e.g. "You've used 75% of ___".
   *
   * Separate from `label` because the labels are written to head a meter row
   * and read as fragments in prose — "You've used 75% of This week". Two
   * phrasings, because one string cannot do both jobs.
   */
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

/** Presentation order — narrowest window first, so the binding limit reads first. */
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

/**
 * How long until a bucket refills, as one short phrase.
 *
 * Deliberately coarse: a countdown to the minute on a multi-day window is false
 * precision, and it forces a re-render every minute for no benefit. Returns
 * `null` when there is nothing meaningful to say, so callers render nothing
 * rather than "Resets in 0 minutes" or a past date.
 *
 * `now` is injectable so this stays testable without freezing global time.
 */
export function formatUsageResetIn(
  resetAt: string | number | Date | null | undefined,
  now: number = Date.now(),
): string | null {
  if (resetAt === null || resetAt === undefined) return null;

  const target = resetAt instanceof Date ? resetAt.getTime() : new Date(resetAt).getTime();
  if (!Number.isFinite(target)) return null;

  const remaining = target - now;
  // Already elapsed: the value is stale, and "resets in -2 hours" is worse than
  // silence. The caller's percentage is the honest signal at that point.
  if (remaining <= 0) return null;

  if (remaining < HOUR_MS) {
    const minutes = Math.max(1, Math.round(remaining / MINUTE_MS));
    return `Resets in ${minutes} min`;
  }
  if (remaining < DAY_MS) {
    const hours = Math.round(remaining / HOUR_MS);
    return `Resets in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(remaining / DAY_MS);
  return `Resets in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * The user-facing sentence for a percentage of allowance remaining.
 *
 * One phrasing everywhere: web said "X% remaining", mobile showed a bar with no
 * number, and the Chrome panel showed "Cloud usage: X%" — which reads as the
 * opposite (used, not remaining) for the same value.
 */
export function formatUsageRemaining(percentRemaining: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percentRemaining)));
  if (clamped === 0) return 'None left';
  return `${clamped}% left`;
}

// ---------------------------------------------------------------------------
// Pre-emptive warning
// ---------------------------------------------------------------------------

/**
 * Below this much remaining, a surface should warn BEFORE the user hits the
 * wall. 25% remaining (75% used) matches the reference products.
 */
export const USAGE_WARNING_REMAINING_PERCENT = 25;

/** Below this, the warning escalates: running out is now imminent. */
export const USAGE_CRITICAL_REMAINING_PERCENT = 10;

export interface ManagedUsageBucketReading {
  bucket: ManagedUsageBucket;
  /** 0-100. Clamped by the selector, so a bad server number cannot invert the copy. */
  percentRemaining: number;
  resetAt?: string | number | Date | null;
}

export interface ManagedUsageWarning {
  bucket: ManagedUsageBucket;
  severity: 'warning' | 'critical';
  percentRemaining: number;
  /** "You've used 75% of your weekly limit" */
  headline: string;
  /** "Resets in 3 hours", or null when the server sent no instant. */
  resetLabel: string | null;
}

/**
 * The one limit worth warning about right now, or null.
 *
 * Picks the BINDING bucket — the one with the least left — rather than the
 * first one over the line. A user whose session bucket is at 95% does not need
 * to be told about their weekly total; telling them about the wrong limit is
 * how a warning teaches people to dismiss warnings.
 *
 * Ties break by presentation order, so the narrowest window wins and the
 * message is stable across re-renders rather than flickering between two
 * equally-drained buckets.
 */
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

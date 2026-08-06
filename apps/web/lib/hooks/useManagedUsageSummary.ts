'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ManagedUsageBucketReading } from '@agiworkforce/types';
import { normalizeUsagePercentage, type ManagedUsageSummaryResponse } from '@agiworkforce/types';

/**
 * GOV-19 — the single source for "how much managed capacity is left".
 *
 * Lives in `lib/hooks` rather than in `features/settings/sections/UsageSection.tsx`
 * (where it was originally written) because the chat surface needs it too: the
 * shared `Sidebar` exposes `showUsageWidget` / `budgetPercent` and renders a
 * threshold progress bar, but no call site in `apps/` or `packages/` passed
 * them — so remaining quota was invisible in the web chat surface, and enabling
 * the widget without wiring the props would have rendered a confident,
 * permanent "0%".
 *
 * Importing a settings SECTION COMPONENT module into the chat page to reach the
 * hook would have pulled the whole Settings > Usage UI into the chat bundle and
 * pointed a feature-level dependency the wrong way, so the hook moved here and
 * `UsageSection` re-exports it. Both surfaces now read one contract instead of
 * two drifting fetches.
 */
export interface ManagedUsageSummaryState {
  usage: ManagedUsageSummaryResponse | null;
  loading: boolean;
  error: string | null;
  /** Null until a fetch has succeeded at least once. */
  lastUpdatedAt: Date | null;
  /** True when the most recent refresh attempt failed. */
  stale: boolean;
  refresh: () => Promise<void>;
}

export function useManagedUsageSummary(): ManagedUsageSummaryState {
  const [usage, setUsage] = useState<ManagedUsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // PAR-4: real state, not the literal string 'Not loaded'. A failed refresh no
  // longer leaves a timestamp that silently claims the data is current.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/usage', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load usage');
      setUsage((await response.json()) as ManagedUsageSummaryResponse);
      setLastUpdatedAt(new Date());
      setStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load usage');
      setStale(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { usage, loading, error, lastUpdatedAt, stale, refresh };
}

/**
 * GOV-19: the percentage the sidebar widget should display — the WORST of the
 * windows that can actually stop the next turn. Showing the billing-period bar
 * alone would read 60% while the rolling 5-hour window is at 100%.
 */
export function getWorstUsagePercent(usage: ManagedUsageSummaryResponse | null): number {
  if (!usage) return 0;
  return Math.max(
    normalizeUsagePercentage(usage.usage_percentage),
    normalizeUsagePercentage(usage.session_usage_percentage),
    normalizeUsagePercentage(usage.weekly_usage_percentage),
    normalizeUsagePercentage(usage.flagship_weekly_usage_percentage),
  );
}

/**
 * The four buckets as readings, keeping WHICH bucket each number belongs to.
 *
 * `getWorstUsagePercent` above collapses them to a single max, which is right
 * for a one-bar widget but loses the bucket identity — so the sidebar can show
 * "92%" without being able to say 92% of what. `selectUsageWarning` needs the
 * identity to name the binding limit in prose, so it gets the readings intact.
 */
export function readManagedUsageBuckets(
  usage: ManagedUsageSummaryResponse | null,
): ManagedUsageBucketReading[] {
  if (!usage) return [];
  return [
    {
      bucket: 'session',
      percentRemaining: 100 - normalizeUsagePercentage(usage.session_usage_percentage),
      resetAt: usage.session_reset_at ?? null,
    },
    {
      bucket: 'weekly',
      percentRemaining: 100 - normalizeUsagePercentage(usage.weekly_usage_percentage),
      resetAt: usage.weekly_reset_at ?? null,
    },
    {
      bucket: 'weeklyFlagship',
      percentRemaining: 100 - normalizeUsagePercentage(usage.flagship_weekly_usage_percentage),
      resetAt: usage.flagship_weekly_reset_at ?? null,
    },
    {
      bucket: 'period',
      percentRemaining: 100 - normalizeUsagePercentage(usage.usage_percentage),
      // `usage_reset_at`, not `period_end`: the billing period can end later
      // than the allowance refills, and the user cares about the refill.
      resetAt: usage.usage_reset_at ?? null,
    },
  ];
}

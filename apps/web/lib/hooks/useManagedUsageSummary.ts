'use client';

import { useCallback, useEffect, useState } from 'react';
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

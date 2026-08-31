'use client';

import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import type { ManagedUsageBucketReading } from '@agiworkforce/types';
import { normalizeUsagePercentage, type ManagedUsageSummaryResponse } from '@agiworkforce/types';

export interface ManagedUsageSummaryState {
  usage: ManagedUsageSummaryResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;
  stale: boolean;
  refresh: () => Promise<void>;
}

const REVALIDATE_INTERVAL_MS = 60_000;

export function useManagedUsageSummary(): ManagedUsageSummaryState {
  const [usage, setUsage] = useState<ManagedUsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);

  const load = useCallback(async (background: boolean) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch('/api/usage', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load usage');
      setUsage((await response.json()) as ManagedUsageSummaryResponse);
      setLastUpdatedAt(new Date());
      setStale(false);
      if (background) setError(null);
    } catch (err) {
      if (!background) setError(toUserMessage(err, 'Could not load usage'));
      setStale(true);
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(false), [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const revalidateWhenVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const timer = setInterval(revalidateWhenVisible, REVALIDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', revalidateWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', revalidateWhenVisible);
    };
  }, [load]);

  return { usage, loading, error, lastUpdatedAt, stale, refresh };
}

export function getWorstUsagePercent(usage: ManagedUsageSummaryResponse | null): number {
  if (!usage) return 0;
  return Math.max(
    normalizeUsagePercentage(usage.usage_percentage),
    normalizeUsagePercentage(usage.session_usage_percentage),
    normalizeUsagePercentage(usage.weekly_usage_percentage),
    normalizeUsagePercentage(usage.flagship_weekly_usage_percentage),
  );
}

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
      resetAt: usage.usage_reset_at ?? null,
    },
  ];
}

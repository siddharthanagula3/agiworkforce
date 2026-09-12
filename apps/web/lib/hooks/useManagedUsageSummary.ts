'use client';

import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/user-error-message';
import type { ManagedUsageBucketReading, ManagedUsageCreditWindow } from '@agiworkforce/types';
import { normalizeUsagePercentage, type ManagedUsageSummaryResponse } from '@agiworkforce/types';

export interface ManagedUsageSummaryState {
  usage: ManagedUsageSummaryResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;
  stale: boolean;
  refresh: () => Promise<void>;
}

const REVALIDATE_INTERVAL_MS = 300_000;

/**
 * One reading of the usage summary, shared by every copy of the hook.
 *
 * Four components mount this at once on a chat route: the page, the shell, the
 * composer and the settings section. Each copy previously held its own state,
 * ran its own mount fetch, its own five minute timer and its own visibility
 * listener, so a single turn asked `/api/usage` four times and the four answers
 * could disagree with each other while they landed.
 *
 * The state lives at module scope because that is the level the data actually
 * lives at: it is one account's usage, not one component's.
 */
interface SharedUsageState {
  usage: ManagedUsageSummaryResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: Date | null;
  stale: boolean;
}

let shared: SharedUsageState = {
  usage: null,
  loading: false,
  error: null,
  lastUpdatedAt: null,
  stale: false,
};

const subscribers = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let revalidateTimer: ReturnType<typeof setInterval> | null = null;

function publish(next: Partial<SharedUsageState>): void {
  shared = { ...shared, ...next };
  for (const notify of subscribers) notify();
}

/**
 * Concurrent callers join the request already in flight rather than starting
 * another. A background revalidation never clears a reading the user can see:
 * it marks the data stale instead, so a flaky poll cannot blank the meter.
 */
function loadUsage(background: boolean): Promise<void> {
  if (inFlight) return inFlight;
  if (!background) publish({ loading: true, error: null });

  inFlight = (async () => {
    try {
      const response = await fetch('/api/usage', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load usage');
      const usage = (await response.json()) as ManagedUsageSummaryResponse;
      publish({ usage, lastUpdatedAt: new Date(), stale: false, error: null });
    } catch (err) {
      publish({
        stale: true,
        ...(background ? {} : { error: toUserMessage(err, 'Could not load usage') }),
      });
    } finally {
      if (!background) publish({ loading: false });
      inFlight = null;
    }
  })();

  return inFlight;
}

function revalidateWhenVisible(): void {
  if (document.visibilityState === 'visible') void loadUsage(true);
}

/** One timer and one listener for all subscribers, not one set per copy. */
function startRevalidating(): void {
  if (revalidateTimer !== null || typeof document === 'undefined') return;
  revalidateTimer = setInterval(revalidateWhenVisible, REVALIDATE_INTERVAL_MS);
  document.addEventListener('visibilitychange', revalidateWhenVisible);
}

function stopRevalidating(): void {
  if (revalidateTimer === null) return;
  clearInterval(revalidateTimer);
  revalidateTimer = null;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', revalidateWhenVisible);
  }
}

/** Test seam: module state outlives a test file without it. */
export function __resetManagedUsageSummaryForTest(): void {
  stopRevalidating();
  subscribers.clear();
  inFlight = null;
  shared = { usage: null, loading: false, error: null, lastUpdatedAt: null, stale: false };
}

export function useManagedUsageSummary(): ManagedUsageSummaryState {
  const [snapshot, setSnapshot] = useState<SharedUsageState>(shared);

  useEffect(() => {
    const notify = () => setSnapshot(shared);
    subscribers.add(notify);
    startRevalidating();
    // A copy that mounts after the first one adopts what is already loaded and
    // asks for a reading only when there is none and none is on its way.
    if (shared.usage === null && inFlight === null) void loadUsage(false);
    else notify();
    return () => {
      subscribers.delete(notify);
      if (subscribers.size === 0) stopRevalidating();
    };
  }, []);

  const refresh = useCallback(() => loadUsage(false), []);

  return {
    usage: snapshot.usage,
    loading: snapshot.loading,
    error: snapshot.error,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    stale: snapshot.stale,
    refresh,
  };
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
  const credits = usage.credits;
  const inCredits = (window: ManagedUsageCreditWindow | null | undefined) =>
    window ? { allowanceCredits: window.allowance, usedCredits: window.used } : {};
  return [
    {
      bucket: 'session',
      percentRemaining: 100 - normalizeUsagePercentage(usage.session_usage_percentage),
      resetAt: usage.session_reset_at ?? null,
      ...inCredits(credits?.five_hour),
    },
    {
      bucket: 'weekly',
      percentRemaining: 100 - normalizeUsagePercentage(usage.weekly_usage_percentage),
      resetAt: usage.weekly_reset_at ?? null,
      ...inCredits(credits?.weekly),
    },
    {
      bucket: 'weeklyFlagship',
      percentRemaining: 100 - normalizeUsagePercentage(usage.flagship_weekly_usage_percentage),
      resetAt: usage.flagship_weekly_reset_at ?? null,
      ...inCredits(credits?.flagship_weekly),
    },
    {
      bucket: 'period',
      percentRemaining: 100 - normalizeUsagePercentage(usage.usage_percentage),
      resetAt: usage.usage_reset_at ?? null,
      ...inCredits(credits?.monthly),
    },
  ];
}

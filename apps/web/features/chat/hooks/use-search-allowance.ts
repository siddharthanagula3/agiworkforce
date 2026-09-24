'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SearchAllowance } from '@/lib/web-search/search-allowance';

type SearchAllowanceView = SearchAllowance | { status: 'idle' | 'checking' | 'unavailable' };
const SEARCH_ALLOWANCE_CHECK_TIMEOUT_MS = 10_000;

function isSearchAllowance(value: unknown): value is SearchAllowance {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record['status'] === 'paid') return true;
  if (
    record['status'] !== 'available' &&
    record['status'] !== 'exhausted' &&
    record['status'] !== 'unknown'
  ) {
    return false;
  }
  if (
    typeof record['limit'] !== 'number' ||
    !Number.isFinite(record['limit']) ||
    record['limit'] < 0 ||
    typeof record['windowDays'] !== 'number' ||
    !Number.isFinite(record['windowDays']) ||
    record['windowDays'] <= 0
  ) {
    return false;
  }
  return (
    record['status'] === 'unknown' ||
    (typeof record['used'] === 'number' && Number.isFinite(record['used']) && record['used'] >= 0)
  );
}

export function useSearchAllowance(
  enabled: boolean,
  accountId: string | null,
): {
  allowance: SearchAllowanceView;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; value: SearchAllowanceView } | null>(
    null,
  );
  const key = `${accountId ?? 'session'}:${attempt}`;

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (active) setSnapshot({ key, value: { status: 'unavailable' } });
    }, SEARCH_ALLOWANCE_CHECK_TIMEOUT_MS);
    void fetch('/api/web-search/allowance', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Search allowance could not be checked');
        const value: unknown = await response.json();
        if (!isSearchAllowance(value)) throw new Error('Search allowance response was invalid');
        if (active && !timedOut) setSnapshot({ key, value });
      })
      .catch(() => {
        if (active && !timedOut) setSnapshot({ key, value: { status: 'unavailable' } });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) return;
    const recheck = () => setAttempt((current) => current + 1);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return {
    allowance: enabled
      ? snapshot?.key === key
        ? snapshot.value
        : { status: 'checking' }
      : { status: 'idle' },
    retry,
  };
}

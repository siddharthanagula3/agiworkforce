'use client';

import { useCallback, useEffect, useState } from 'react';
import { WEB_SEARCH_ALLOWANCE_PATH, WebSearchAllowanceSchema } from '@agiworkforce/cloud-contracts';
import type { SearchAllowance } from '@/lib/web-search/search-allowance';

type SearchAllowanceView = SearchAllowance | { status: 'idle' | 'checking' | 'unavailable' };
const SEARCH_ALLOWANCE_CHECK_TIMEOUT_MS = 10_000;

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
    void fetch(WEB_SEARCH_ALLOWANCE_PATH, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Search allowance could not be checked');
        const parsed = WebSearchAllowanceSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Search allowance response was invalid');
        if (active && !timedOut) setSnapshot({ key, value: parsed.data });
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

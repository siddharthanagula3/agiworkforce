'use client';

import { useEffect, useState } from 'react';
import type { SupportAccountContextView } from '../lib/contract';
import { fetchAccountContext } from '../lib/support-client';

export interface SupportAccountContextState {
  context: SupportAccountContextView;
  loading: boolean;
}

export function useSupportAccountContext(active: boolean): SupportAccountContextState {
  const [context, setContext] = useState<SupportAccountContextView>({ signedIn: false });
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (!active || loadedOnce) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    void fetchAccountContext(controller.signal).then((next) => {
      if (cancelled) return;
      setContext(next);
      setLoading(false);
      setLoadedOnce(true);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, loadedOnce]);

  return { context, loading };
}

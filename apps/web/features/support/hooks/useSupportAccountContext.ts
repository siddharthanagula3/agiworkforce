'use client';

/**
 * Signed-in state and the account facts the agent can see.
 *
 * The signed-in signal is the SERVER's answer (`/api/support/account/context`
 * returning 200), not a client-side Clerk hook. That matters: the widget's
 * account affordances must track what the server will actually authorize, and
 * a 401 is a legitimate, expected, non-error outcome on the marketing site.
 *
 * Everything degrades to `{ signedIn: false }` — 401, 403, 404, a malformed
 * body, or a dropped connection. Signed-out is a supported mode, not a failure.
 */

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

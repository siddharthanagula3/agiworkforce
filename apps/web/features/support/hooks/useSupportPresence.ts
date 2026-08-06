'use client';

/**
 * Human availability, fetched honestly.
 *
 * The initial value is `UNAVAILABLE_PRESENCE` and ONLY a successful response
 * carrying `live: true` can change that. A pending request, a network failure, a
 * 404 (route not deployed), a malformed body, and an explicit "no one is
 * online" all present identically to the UI: no live-chat control is rendered.
 *
 * That ordering is the whole point. If presence defaulted to unknown-and-
 * optimistic, an unstaffed or half-deployed install would offer a human who is
 * not there — the single most damaging pattern in support.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { UNAVAILABLE_PRESENCE, type SupportPresenceView } from '../lib/contract';
import { fetchPresence } from '../lib/support-client';

export interface SupportPresenceState {
  presence: SupportPresenceView;
  /** True until the first response resolves. The UI shows "checking", never "available". */
  checking: boolean;
  refresh: () => void;
}

export function useSupportPresence(active: boolean): SupportPresenceState {
  const [presence, setPresence] = useState<SupportPresenceView>(UNAVAILABLE_PRESENCE);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    const next = await fetchPresence(signal);
    if (!mounted.current) return;
    setPresence(next);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [active, load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { presence, checking, refresh };
}

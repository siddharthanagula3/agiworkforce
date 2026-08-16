'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UNAVAILABLE_PRESENCE, type SupportPresenceView } from '../lib/contract';
import { fetchPresence } from '../lib/support-client';

export interface SupportPresenceState {
  presence: SupportPresenceView;
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

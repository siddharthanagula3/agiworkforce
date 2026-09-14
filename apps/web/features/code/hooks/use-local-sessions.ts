'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DeveloperSession, DeveloperSessionGroup } from '@agiworkforce/local-runtime-contract';
import {
  listDeveloperSessions,
  onDeveloperSessionEvent,
  pickWorkspaceRoot,
  startDeveloperSession,
  useDesktopHost,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY, sharedUnavailableLine } from '../local-code';

export interface LocalSessionsState {
  supported: boolean;
  groups: DeveloperSessionGroup[];
  loading: boolean;
  adding: boolean;
  error: string | null;
  unavailable: string | null;
  refresh: () => void;
  addFolder: () => Promise<void>;
  startSession: (rootId: string) => Promise<DeveloperSession | null>;
}

/**
 * The coding sessions the AGI CLI has recorded for every folder this Mac has
 * opened to AGI. Absent in a browser, where there is no host to ask.
 */
export function useLocalSessions(): LocalSessionsState {
  const host = useDesktopHost();
  const supported = host !== null;
  const [groups, setGroups] = useState<DeveloperSessionGroup[]>([]);
  const [loading, setLoading] = useState(supported);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listDeveloperSessions()
      .then((list) => {
        if (cancelled) return;
        setGroups(list.groups);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, LOCAL_CODE_COPY.readFailed));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supported, reloadKey]);

  useEffect(() => {
    if (!supported) return;
    return onDeveloperSessionEvent((_rootId, event) => {
      if (event.type === 'turn-finished') refresh();
    });
  }, [supported, refresh]);

  const addFolder = useCallback(async () => {
    setAdding(true);
    setError(null);
    try {
      await pickWorkspaceRoot();
      refresh();
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.startFailed));
    } finally {
      setAdding(false);
    }
  }, [refresh]);

  const startSession = useCallback(
    async (rootId: string) => {
      setError(null);
      try {
        const session = await startDeveloperSession(rootId);
        refresh();
        return session;
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.startFailed));
        return null;
      }
    },
    [refresh],
  );

  return {
    supported,
    groups,
    loading,
    adding,
    error,
    unavailable: sharedUnavailableLine(groups),
    refresh,
    addFolder,
    startSession,
  };
}

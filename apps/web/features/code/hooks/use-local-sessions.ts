'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  DeveloperRuntimeModels,
  LocalDeveloperSession,
  DeveloperSessionGroup,
} from '@agiworkforce/local-runtime-contract';
import {
  listDeveloperModels,
  listDeveloperSessions,
  onDeveloperSessionEvent,
  pickWorkspaceRoot,
  startDeveloperSession,
  useDesktopHost,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY, sharedUnavailableLine, startingModelId } from '../local-code';

export interface LocalSessionsState {
  supported: boolean;
  groups: DeveloperSessionGroup[];
  loading: boolean;
  adding: boolean;
  error: string | null;
  unavailable: string | null;
  refresh: () => void;
  addFolder: () => Promise<void>;
  startSession: (rootId: string) => Promise<LocalDeveloperSession | null>;
  modelsFor: (rootId: string) => DeveloperRuntimeModels | null;
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
  const [models, setModels] = useState<Record<string, DeveloperRuntimeModels>>({});

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

  useEffect(() => {
    const pending = groups.filter((group) => group.unavailable === undefined);
    if (pending.length === 0) return;
    let cancelled = false;

    const read = (refresh: boolean) => {
      void Promise.all(
        pending.map(async (group) => {
          try {
            return [
              group.rootId,
              await listDeveloperModels(group.rootId, refresh ? { refresh: true } : {}),
            ] as const;
          } catch {
            return null;
          }
        }),
      ).then((entries) => {
        if (cancelled) return;
        const resolved = entries.filter(
          (entry): entry is [string, DeveloperRuntimeModels] => entry !== null,
        );
        if (resolved.length > 0) setModels(Object.fromEntries(resolved));
      });
    };

    read(false);
    const onFocus = () => read(true);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [groups]);

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
      const group = groups.find((candidate) => candidate.rootId === rootId);
      const model = startingModelId(models[rootId] ?? null, group?.sessions ?? []);
      try {
        const session = await startDeveloperSession(rootId, model);
        refresh();
        return session;
      } catch (cause: unknown) {
        setError(toUserMessage(cause, LOCAL_CODE_COPY.startFailed));
        return null;
      }
    },
    [refresh, groups, models],
  );

  const modelsFor = useCallback((rootId: string) => models[rootId] ?? null, [models]);

  return {
    supported,
    groups,
    modelsFor,
    loading,
    adding,
    error,
    unavailable: sharedUnavailableLine(groups),
    refresh,
    addFolder,
    startSession,
  };
}

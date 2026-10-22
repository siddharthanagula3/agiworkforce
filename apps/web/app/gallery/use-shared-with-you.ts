'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';

export interface SharedWithYouArtifact {
  token: string;
  title: string;
  kind: string;
  updatedAt: string;
}

interface SharedWithYouPage {
  items?: SharedWithYouArtifact[];
  nextCursor?: string | null;
  emailVerified?: boolean;
}

export interface SharedWithYouState {
  items: SharedWithYouArtifact[];
  loaded: boolean;
  error: string | null;
  emailVerified: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

const SHARED_WITH_YOU_PATH = '/api/artifacts/shared-with-me';

export function useSharedWithYou(): SharedWithYouState {
  const { isLoaded, isSignedIn, getToken } = useSession();
  const [items, setItems] = useState<SharedWithYouArtifact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal): Promise<SharedWithYouPage> => {
      const token = await getToken();
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const res = await fetch(`${SHARED_WITH_YOU_PATH}${query}`, {
        credentials: 'include',
        signal,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      }
      return (await res.json()) as SharedWithYouPage;
    },
    [getToken],
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setItems([]);
      setNextCursor(null);
      setError(null);
      setLoaded(true);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setLoaded(false);
    setLoadingMore(false);
    setError(null);

    void (async () => {
      try {
        const page = await fetchPage(null, controller.signal);
        if (controller.signal.aborted) return;
        setItems(page.items ?? []);
        setNextCursor(page.nextCursor ?? null);
        setEmailVerified(page.emailVerified !== false);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setItems([]);
        setNextCursor(null);
        setError(toUserMessage(cause, 'Shared artifacts could not be loaded'));
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isLoaded, isSignedIn, fetchPage, attempt]);

  const loadMore = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    void (async () => {
      try {
        const page = await fetchPage(nextCursor, controller.signal);
        if (controller.signal.aborted) return;
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.token));
          return [...prev, ...(page.items ?? []).filter((item) => !seen.has(item.token))];
        });
        setNextCursor(page.nextCursor ?? null);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(toUserMessage(cause, 'More shared artifacts could not be loaded'));
      } finally {
        if (!controller.signal.aborted) setLoadingMore(false);
      }
    })();
  }, [fetchPage, loadingMore, nextCursor]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    items,
    loaded,
    error,
    emailVerified,
    hasMore: nextCursor !== null,
    loadingMore,
    loadMore,
    retry,
  };
}

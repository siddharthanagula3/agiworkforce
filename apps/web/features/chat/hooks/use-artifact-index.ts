'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

export interface IndexedArtifact {
  id: string;
  conversationId: string;
  messageId: string;
  title: string | null;
  type: string;
  language: string | null;
  createdAt: string;
}

interface ArtifactIndexState {
  artifacts: IndexedArtifact[];
  /** False until the first response lands, so callers can avoid an empty flash. */
  loaded: boolean;
}

export function useArtifactIndex(): ArtifactIndexState {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [state, setState] = useState<ArtifactIndexState>({ artifacts: [], loaded: false });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Signed out: there is no account index to read. Mark loaded so the
      // gallery shows its real empty state instead of a permanent skeleton.
      setState({ artifacts: [], loaded: true });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/artifacts/index', {
          credentials: 'include',
          signal: controller.signal,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        });
        if (!res.ok) throw new Error(`artifact index responded ${res.status}`);
        const body = (await res.json()) as { artifacts?: IndexedArtifact[] };
        if (cancelled) return;
        setState({ artifacts: body.artifacts ?? [], loaded: true });
      } catch {
        if (cancelled) return;
        setState((prev) => ({ artifacts: prev.artifacts, loaded: true }));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isLoaded, isSignedIn, getToken]);

  return state;
}

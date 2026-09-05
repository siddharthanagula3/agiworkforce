'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/identity/client';

/**
 * The account-wide artifact index (migration 0121, `GET /api/artifacts/index`).
 *
 * The locally-derived artifact store only knows about conversations THIS device
 * has actually rendered, because web artifacts are derived from message
 * markdown at render time. That is fine for persistence, reopening a
 * conversation re-derives its artifacts under the same deterministic id, but
 * it makes the gallery under-report: on a fresh device it shows only what you
 * happen to have opened.
 *
 * This hook supplies the rest: metadata rows for every artifact on the account.
 * They carry NO content (the index stores none), so a row that is not also in
 * the local store renders as a card without a live thumbnail and opens its
 * source conversation, where it is re-derived in full.
 */

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
  const { isLoaded, isSignedIn, getToken } = useSession();
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
        // The index is a discovery aid layered on top of what the device
        // already derived locally. If it cannot be read, the gallery still
        // shows every artifact from conversations this device has opened.
        // degrade quietly rather than blanking a working surface.
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

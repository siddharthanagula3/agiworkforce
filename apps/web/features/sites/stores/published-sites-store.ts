'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { readPublishedTokenFromUrl } from '@features/chat/components/artifacts/publishArtifactClient';
import {
  listPublishedSites,
  sitePath,
  type PublishedSite,
  type SiteVisibility,
} from '../services/sites-service';

export interface PublishedSiteState {
  token: string;
  shareUrl: string;
  visibility: SiteVisibility;
  sitePath: string;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PublishedSitesStore {
  byArtifactId: Record<string, PublishedSiteState>;
  status: LoadStatus;
  hydrate: (sites: readonly PublishedSite[]) => void;
  record: (artifactId: string, details: { shareUrl: string; visibility: SiteVisibility }) => void;
  forget: (artifactId: string) => void;
  ensureLoaded: () => Promise<void>;
}

function stateFor(token: string, shareUrl: string, visibility: SiteVisibility) {
  return { token, shareUrl, visibility, sitePath: sitePath(token) };
}

export const usePublishedSitesStore = create<PublishedSitesStore>((set, get) => ({
  byArtifactId: {},
  status: 'idle',

  hydrate: (sites) =>
    set({
      status: 'ready',
      byArtifactId: Object.fromEntries(
        sites.map((site) => [
          site.artifactId,
          stateFor(site.token, site.shareUrl, site.visibility),
        ]),
      ),
    }),

  record: (artifactId, details) => {
    const token = readPublishedTokenFromUrl(details.shareUrl);
    if (!token) return;
    set((state) => ({
      byArtifactId: {
        ...state.byArtifactId,
        [artifactId]: stateFor(token, details.shareUrl, details.visibility),
      },
    }));
  },

  forget: (artifactId) =>
    set((state) => {
      if (!(artifactId in state.byArtifactId)) return state;
      const next = { ...state.byArtifactId };
      delete next[artifactId];
      return { byArtifactId: next };
    }),

  ensureLoaded: async () => {
    if (get().status !== 'idle') return;
    set({ status: 'loading' });
    try {
      const { sites } = await listPublishedSites();
      const recorded = get().byArtifactId;
      get().hydrate(sites);
      set((state) => ({ byArtifactId: { ...state.byArtifactId, ...recorded } }));
    } catch {
      set({ status: 'error' });
    }
  },
}));

/**
 * The live publication of one chat artifact, or null when it has none. Reading
 * it loads the account's publications once per session.
 */
export function usePublishedSite(artifactId: string | null | undefined): PublishedSiteState | null {
  const site = usePublishedSitesStore((state) =>
    artifactId ? (state.byArtifactId[artifactId] ?? null) : null,
  );
  const ensureLoaded = usePublishedSitesStore((state) => state.ensureLoaded);
  useEffect(() => {
    if (artifactId) void ensureLoaded();
  }, [artifactId, ensureLoaded]);
  return site;
}

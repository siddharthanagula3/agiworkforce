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

export const usePublishedSitesStore = create<PublishedSitesStore>((set, get) => {
  let pendingLoad: Map<string, PublishedSiteState | null> | null = null;

  return {
    byArtifactId: {},
    status: 'idle',

    hydrate: (sites) => {
      pendingLoad?.clear();
      pendingLoad = null;
      set({
        status: 'ready',
        byArtifactId: Object.fromEntries(
          sites.map((site) => [
            site.artifactId,
            stateFor(site.token, site.shareUrl, site.visibility),
          ]),
        ),
      });
    },

    record: (artifactId, details) => {
      const token = readPublishedTokenFromUrl(details.shareUrl);
      if (!token) return;
      const publication = stateFor(token, details.shareUrl, details.visibility);
      pendingLoad?.set(artifactId, publication);
      set((state) => ({
        byArtifactId: {
          ...state.byArtifactId,
          [artifactId]: publication,
        },
      }));
    },

    forget: (artifactId) => {
      pendingLoad?.set(artifactId, null);
      set((state) => {
        if (!(artifactId in state.byArtifactId)) return state;
        const next = { ...state.byArtifactId };
        delete next[artifactId];
        return { byArtifactId: next };
      });
    },

    ensureLoaded: async () => {
      if (get().status !== 'idle') return;
      const request = new Map<string, PublishedSiteState | null>(
        Object.entries(get().byArtifactId),
      );
      pendingLoad = request;
      set({ status: 'loading' });
      try {
        const { sites } = await listPublishedSites();
        if (pendingLoad !== request) return;
        const publications = new Map(
          sites.map((site) => [
            site.artifactId,
            stateFor(site.token, site.shareUrl, site.visibility),
          ]),
        );
        for (const [artifactId, publication] of request) {
          if (publication === null) publications.delete(artifactId);
          else publications.set(artifactId, publication);
        }
        pendingLoad = null;
        request.clear();
        set({ status: 'ready', byArtifactId: Object.fromEntries(publications) });
      } catch {
        if (pendingLoad !== request) return;
        pendingLoad = null;
        request.clear();
        set({ status: 'error' });
      } finally {
        if (pendingLoad === request) pendingLoad = null;
        request.clear();
      }
    },
  };
});

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

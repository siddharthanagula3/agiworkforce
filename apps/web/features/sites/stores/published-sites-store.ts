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

declare const publicationLeaseBrand: unique symbol;
export type PublicationLease = { readonly epoch: number; readonly [publicationLeaseBrand]: true };
let nextEpoch = 0;
function newLease(): PublicationLease {
  return Object.freeze({ epoch: ++nextEpoch }) as PublicationLease;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PublishedSitesStore {
  lease: PublicationLease | null;
  beginCleanup: () => () => void;
  byArtifactId: Record<string, PublishedSiteState>;
  status: LoadStatus;
  hydrate: (sites: readonly PublishedSite[], lease: PublicationLease) => boolean;
  record: (
    artifactId: string,
    details: { shareUrl: string; visibility: SiteVisibility },
    lease: PublicationLease,
  ) => boolean;
  forget: (artifactId: string, lease: PublicationLease) => boolean;
  ensureLoaded: (lease: PublicationLease) => Promise<void>;
}

function stateFor(token: string, shareUrl: string, visibility: SiteVisibility) {
  return { token, shareUrl, visibility, sitePath: sitePath(token) };
}

export const usePublishedSitesStore = create<PublishedSitesStore>((set, get) => {
  let pendingLoad: Map<string, PublishedSiteState | null> | null = null;

  const cleanups = new Set<object>();
  const owns = (lease: PublicationLease) => lease != null && get().lease === lease;

  return {
    lease: newLease(),
    beginCleanup: () => {
      const token = {};
      cleanups.add(token);
      pendingLoad?.clear();
      pendingLoad = null;
      set({ lease: null, byArtifactId: {}, status: 'idle' });
      return () => {
        if (!cleanups.delete(token) || cleanups.size !== 0) return;
        set({ lease: newLease() });
      };
    },
    byArtifactId: {},
    status: 'idle',

    hydrate: (sites, lease) => {
      if (!owns(lease)) return false;
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
      return owns(lease);
    },

    record: (artifactId, details, lease) => {
      if (!owns(lease)) return false;
      const token = readPublishedTokenFromUrl(details.shareUrl);
      if (!token) return false;
      const publication = stateFor(token, details.shareUrl, details.visibility);
      pendingLoad?.set(artifactId, publication);
      set((state) => ({
        byArtifactId: {
          ...state.byArtifactId,
          [artifactId]: publication,
        },
      }));
      return owns(lease);
    },

    forget: (artifactId, lease) => {
      if (!owns(lease)) return false;
      pendingLoad?.set(artifactId, null);
      set((state) => {
        if (!(artifactId in state.byArtifactId)) return state;
        const next = { ...state.byArtifactId };
        delete next[artifactId];
        return { byArtifactId: next };
      });
      return owns(lease);
    },

    ensureLoaded: async (lease) => {
      if (!owns(lease) || get().status !== 'idle') return;
      const request = new Map<string, PublishedSiteState | null>(
        Object.entries(get().byArtifactId),
      );
      pendingLoad = request;
      set({ status: 'loading' });
      if (!owns(lease) || pendingLoad !== request) return;
      try {
        const { sites } = await listPublishedSites();
        if (!owns(lease) || pendingLoad !== request) return;
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
        if (!owns(lease) || pendingLoad !== request) return;
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

export function capturePublicationLease(): PublicationLease | null {
  return usePublishedSitesStore.getState().lease;
}

export function isPublicationLeaseCurrent(lease: PublicationLease | null): lease is PublicationLease {
  return lease !== null && usePublishedSitesStore.getState().lease === lease;
}

export function beginPublicationCleanup(): () => void {
  return usePublishedSitesStore.getState().beginCleanup();
}

/**
 * The live publication of one chat artifact, or null when it has none. Reading
 * it loads the account's publications once per session.
 */
export function usePublishedSite(artifactId: string | null | undefined): PublishedSiteState | null {
  const site = usePublishedSitesStore((state) =>
    artifactId ? (state.byArtifactId[artifactId] ?? null) : null,
  );
  const lease = usePublishedSitesStore((state) => state.lease);
  const ensureLoaded = usePublishedSitesStore((state) => state.ensureLoaded);
  useEffect(() => {
    if (artifactId && lease) void ensureLoaded(lease);
  }, [artifactId, ensureLoaded, lease]);
  return site;
}

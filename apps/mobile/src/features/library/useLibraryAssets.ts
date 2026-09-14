import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/src/features/auth/store';
import {
  deleteLibraryAsset,
  fetchLibraryPage,
  LIBRARY_PAGE_SIZE,
  type LibraryAsset,
} from './libraryClient';
import { useLibraryCacheStore } from './libraryCacheStore';

export interface LibraryAssetsState {
  assets: LibraryAsset[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  showingCachedPage: boolean;
  signedOut: boolean;
  refresh: () => void;
  loadMore: () => void;
  removeAsset: (id: string) => Promise<void>;
}

function messageFor(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'The Library could not be reached. Pull to try again.';
}

export function useLibraryAssets(search: string): LibraryAssetsState {
  const ownerId = useAuthStore((state) => state.clerkUserId);
  const rememberLibraryPage = useLibraryCacheStore((state) => state.rememberLibraryPage);
  const readLibraryPage = useLibraryCacheStore((state) => state.readLibraryPage);
  const clearLibraryCache = useLibraryCacheStore((state) => state.clearLibraryCache);

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showingCachedPage, setShowingCachedPage] = useState(false);
  const requestRef = useRef(0);

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!ownerId) {
        clearLibraryCache();
        setAssets([]);
        setHasMore(false);
        setShowingCachedPage(false);
        setError(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const request = requestRef.current + 1;
      requestRef.current = request;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);

      try {
        const page = await fetchLibraryPage({ offset: 0, search });
        if (requestRef.current !== request) return;
        setAssets(page.assets);
        setHasMore(page.hasMore);
        setShowingCachedPage(false);
        setError(null);
        if (!search.trim()) rememberLibraryPage(ownerId, page.assets);
      } catch (caught) {
        if (requestRef.current !== request) return;
        const cached = search.trim() ? null : readLibraryPage(ownerId);
        setAssets(cached ?? []);
        setHasMore(false);
        setShowingCachedPage(Boolean(cached));
        setError(messageFor(caught));
      } finally {
        if (requestRef.current === request) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [clearLibraryCache, ownerId, readLibraryPage, rememberLibraryPage, search],
  );

  useEffect(() => {
    void loadFirstPage('initial');
  }, [loadFirstPage]);

  const refresh = useCallback(() => {
    void loadFirstPage('refresh');
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    if (!ownerId || !hasMore || loadingMore || loading || refreshing || showingCachedPage) return;
    const request = requestRef.current;
    setLoadingMore(true);
    void fetchLibraryPage({ offset: assets.length, limit: LIBRARY_PAGE_SIZE, search })
      .then((page) => {
        if (requestRef.current !== request) return;
        setAssets((current) => {
          const seen = new Set(current.map((asset) => asset.id));
          return [...current, ...page.assets.filter((asset) => !seen.has(asset.id))];
        });
        setHasMore(page.hasMore);
      })
      .catch((caught: unknown) => {
        if (requestRef.current !== request) return;
        setError(messageFor(caught));
        setHasMore(false);
      })
      .finally(() => {
        if (requestRef.current === request) setLoadingMore(false);
      });
  }, [
    assets.length,
    hasMore,
    loading,
    loadingMore,
    ownerId,
    refreshing,
    search,
    showingCachedPage,
  ]);

  const removeAsset = useCallback(async (id: string) => {
    await deleteLibraryAsset(id);
    setAssets((current) => current.filter((asset) => asset.id !== id));
  }, []);

  return {
    assets,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    showingCachedPage,
    signedOut: !ownerId,
    refresh,
    loadMore,
    removeAsset,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { LIBRARY_DEFAULT_SORT, type LibrarySort } from '@agiworkforce/cloud-contracts';
import { useAuthStore } from '@/src/features/auth/store';
import {
  deleteLibraryAsset,
  fetchLibraryPage,
  LIBRARY_PAGE_SIZE,
  permanentlyDeleteLibraryAsset,
  restoreLibraryAsset,
  type LibraryAsset,
  type LibraryScope,
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
  storageUsedBytes: number | null;
  storageLimitBytes: number | null;
  refresh: () => void;
  loadMore: () => void;
  removeAsset: (id: string) => Promise<void>;
  restoreAsset: (id: string) => Promise<void>;
  permanentlyDeleteAsset: (id: string) => Promise<void>;
}

const LIBRARY_LOAD_ERROR = 'The Library could not be reached. Pull to try again.';

export function useLibraryAssets(
  search: string,
  sort: LibrarySort = LIBRARY_DEFAULT_SORT,
  scope: LibraryScope = {},
): LibraryAssetsState {
  const { origin, kind, deleted } = scope;
  const scopeKey = `${origin ?? ''}|${kind ?? ''}|${deleted ? 'deleted' : ''}`;
  const defaultScope = scopeKey === '||';
  const ownerId = useAuthStore((state) => state.clerkUserId);
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const rememberLibraryPage = useLibraryCacheStore((state) => state.rememberLibraryPage);
  const removeLibraryAsset = useLibraryCacheStore((state) => state.removeLibraryAsset);
  const readLibraryPage = useLibraryCacheStore((state) => state.readLibraryPage);
  const clearLibraryCache = useLibraryCacheStore((state) => state.clearLibraryCache);

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadedScope, setLoadedScope] = useState<{
    ownerId: string;
    search: string;
    sort: LibrarySort;
    scopeKey: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ used: number | null; limit: number | null }>({
    used: null,
    limit: null,
  });
  const [showingCachedPage, setShowingCachedPage] = useState(false);
  const requestRef = useRef(0);

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!ownerId) {
        requestRef.current += 1;
        clearLibraryCache();
        setAssets([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadedScope(null);
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
      setLoadingMore(false);
      setError(null);
      setShowingCachedPage(false);

      try {
        const page = await fetchLibraryPage({ offset: 0, search, sort, origin, kind, deleted });
        if (requestRef.current !== request || ownerIdRef.current !== ownerId) return;
        setAssets(page.assets);
        setNextOffset(page.nextOffset);
        setHasMore(page.hasMore);
        setLoadedScope({ ownerId, search, sort, scopeKey });
        setShowingCachedPage(false);
        setError(null);
        if (!deleted) {
          setStorage({
            used: page.storageUsedBytes ?? null,
            limit: page.storageLimitBytes ?? null,
          });
        }
        if (!search.trim() && sort === LIBRARY_DEFAULT_SORT && defaultScope)
          rememberLibraryPage(ownerId, page.assets);
      } catch {
        if (requestRef.current !== request || ownerIdRef.current !== ownerId) return;
        const cached =
          search.trim() || sort !== LIBRARY_DEFAULT_SORT || !defaultScope
            ? null
            : readLibraryPage(ownerId);
        setAssets(cached ?? []);
        setLoadedScope({ ownerId, search, sort, scopeKey });
        setHasMore(false);
        setNextOffset(null);
        setShowingCachedPage(Boolean(cached));
        setError(LIBRARY_LOAD_ERROR);
      } finally {
        if (requestRef.current === request && ownerIdRef.current === ownerId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      clearLibraryCache,
      defaultScope,
      deleted,
      kind,
      origin,
      ownerId,
      readLibraryPage,
      rememberLibraryPage,
      scopeKey,
      search,
      sort,
    ],
  );

  useEffect(() => {
    void loadFirstPage('initial');
  }, [loadFirstPage]);

  const refresh = useCallback(() => {
    void loadFirstPage('refresh');
  }, [loadFirstPage]);

  const loadMore = useCallback(() => {
    if (
      !ownerId ||
      loadedScope?.ownerId !== ownerId ||
      loadedScope.search !== search ||
      loadedScope.sort !== sort ||
      loadedScope.scopeKey !== scopeKey ||
      !hasMore ||
      nextOffset === null ||
      loadingMore ||
      loading ||
      refreshing ||
      showingCachedPage
    )
      return;
    const request = requestRef.current;
    const offset = nextOffset;
    setLoadingMore(true);
    void fetchLibraryPage({
      offset,
      limit: LIBRARY_PAGE_SIZE,
      search,
      sort,
      origin,
      kind,
      deleted,
    })
      .then((page) => {
        if (requestRef.current !== request || ownerIdRef.current !== ownerId) return;
        setAssets((current) => {
          const seen = new Set(current.map((asset) => asset.id));
          return [...current, ...page.assets.filter((asset) => !seen.has(asset.id))];
        });
        setNextOffset(page.nextOffset);
        setHasMore(page.hasMore);
      })
      .catch(() => {
        if (requestRef.current !== request || ownerIdRef.current !== ownerId) return;
        setError(LIBRARY_LOAD_ERROR);
        setHasMore(false);
      })
      .finally(() => {
        if (requestRef.current === request && ownerIdRef.current === ownerId) setLoadingMore(false);
      });
  }, [
    deleted,
    hasMore,
    kind,
    origin,
    scopeKey,
    loadedScope,
    loading,
    loadingMore,
    nextOffset,
    ownerId,
    refreshing,
    search,
    showingCachedPage,
    sort,
  ]);

  const removeAsset = useCallback(
    async (id: string) => {
      if (!ownerId) return;
      await deleteLibraryAsset(id);
      if (ownerIdRef.current !== ownerId) return;
      setAssets((current) => current.filter((asset) => asset.id !== id));
      removeLibraryAsset(ownerId, id);
    },
    [ownerId, removeLibraryAsset],
  );

  const restoreAsset = useCallback(
    async (id: string) => {
      if (!ownerId) return;
      await restoreLibraryAsset(id);
      if (ownerIdRef.current !== ownerId) return;
      setAssets((current) => current.filter((asset) => asset.id !== id));
    },
    [ownerId],
  );

  const permanentlyDeleteAsset = useCallback(
    async (id: string) => {
      if (!ownerId) return;
      await permanentlyDeleteLibraryAsset(id);
      if (ownerIdRef.current !== ownerId) return;
      setAssets((current) => current.filter((asset) => asset.id !== id));
      removeLibraryAsset(ownerId, id);
    },
    [ownerId, removeLibraryAsset],
  );

  return {
    assets:
      loadedScope?.ownerId === ownerId &&
      loadedScope.search === search &&
      loadedScope.sort === sort &&
      loadedScope.scopeKey === scopeKey
        ? assets
        : [],
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    showingCachedPage,
    signedOut: !ownerId,
    storageUsedBytes: storage.used,
    storageLimitBytes: storage.limit,
    refresh,
    loadMore,
    removeAsset,
    restoreAsset,
    permanentlyDeleteAsset,
  };
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import type Cache from './cache';
import { memoryCache } from './cache';

export interface UseCacheOptions {
  cache?: Cache;
  ttl?: number;
  tags?: string[];
  enabled?: boolean;
}

export const useCache = <T = unknown>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCacheOptions = {},
) => {
  const { cache = memoryCache, ttl, tags, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!enabled) return;

      setLoading(true);
      setError(null);

      try {
        // Try to get from cache first
        if (!forceRefresh) {
          const cached = await cache.get<T>(key);
          if (cached !== null) {
            setData(cached);
            setLoading(false);
            return cached;
          }
        }

        // Fetch fresh data
        const freshData = await fetcher();

        // Cache the result
        await cache.set(key, freshData, { ttl, tags });

        setData(freshData);
        setLoading(false);
        return freshData;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Fetch failed');
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [key, fetcher, cache, ttl, tags, enabled],
  );

  const invalidate = useCallback(async () => {
    await cache.delete(key);
    return fetchData(true);
  }, [cache, key, fetchData]);

  useEffect(() => {
    // Use queueMicrotask to avoid cascading renders from synchronous setState
    queueMicrotask(() => {
      fetchData();
    });
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: () => fetchData(true),
    invalidate,
  };
};

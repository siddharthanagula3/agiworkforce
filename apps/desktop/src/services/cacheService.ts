import { invoke } from '../lib/tauri-mock';
import type { CacheAnalytics, CacheStats, CacheType } from '../types/cache';

export const CacheService = {
  getStats: () => invoke<CacheStats>('cache_get_stats'),
  clearAll: () => invoke<void>('cache_clear_all'),
  clearByType: (cacheType: CacheType) => invoke<void>('cache_clear_by_type', { cacheType }),
  clearByProvider: (provider: string) => invoke<void>('cache_clear_by_provider', { provider }),
  export: () => invoke<string>('cache_export'),
  getAnalytics: () => invoke<CacheAnalytics>('cache_get_analytics'),
  pruneExpired: () => invoke<number>('cache_prune_expired'),
};

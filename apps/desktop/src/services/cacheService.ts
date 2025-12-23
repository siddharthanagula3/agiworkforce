import { invoke } from '../lib/tauri-mock';
import type { CacheAnalytics, CacheSettings, CacheStats, CacheType } from '../types/cache';

export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>('cache_get_stats');
}

export async function clearAllCache(): Promise<void> {
  return invoke('cache_clear_all');
}

export async function clearCacheByType(cacheType: CacheType): Promise<void> {
  return invoke('cache_clear_by_type', { cacheType });
}

export async function clearCacheByProvider(provider: string): Promise<void> {
  return invoke('cache_clear_by_provider', { provider });
}

export async function getCacheSize(): Promise<number> {
  return invoke<number>('cache_get_size');
}

export async function configureCache(settings: CacheSettings): Promise<void> {
  return invoke('cache_configure', { settings });
}

export async function warmupCache(queries: string[]): Promise<void> {
  return invoke('cache_warmup', { queries });
}

export async function exportCache(): Promise<string> {
  return invoke<string>('cache_export');
}

export async function getCacheAnalytics(): Promise<CacheAnalytics> {
  return invoke<CacheAnalytics>('cache_get_analytics');
}

export async function pruneExpiredCache(): Promise<number> {
  return invoke<number>('cache_prune_expired');
}

export const CacheService = {
  getStats: getCacheStats,
  clearAll: clearAllCache,
  clearByType: clearCacheByType,
  clearByProvider: clearCacheByProvider,
  getSize: getCacheSize,
  configure: configureCache,
  warmup: warmupCache,
  export: exportCache,
  getAnalytics: getCacheAnalytics,
  pruneExpired: pruneExpiredCache,
};

import { invoke } from '../lib/tauri-mock';
import type { CacheAnalytics, CacheSettings, CacheStats, CacheType } from '../types/cache';

// Default cache type stats for when operations fail
const DEFAULT_CACHE_TYPE_STATS = {
  hits: 0,
  misses: 0,
  hit_rate: 0,
  size_mb: 0,
  entries: 0,
  savings_usd: 0,
};

// Default stats to return when cache operations fail
const DEFAULT_CACHE_STATS: CacheStats = {
  llm_cache: { ...DEFAULT_CACHE_TYPE_STATS },
  tool_cache: { ...DEFAULT_CACHE_TYPE_STATS },
  codebase_cache: { ...DEFAULT_CACHE_TYPE_STATS },
  total_size_mb: 0,
  total_savings_usd: 0,
};

// Default analytics to return when cache operations fail
const DEFAULT_CACHE_ANALYTICS: CacheAnalytics = {
  most_cached_queries: [],
  provider_breakdown: [],
  total_cost_saved: 0,
  total_tokens_saved: 0,
};

export async function getCacheStats(): Promise<CacheStats> {
  try {
    return await invoke<CacheStats>('cache_get_stats');
  } catch (error) {
    console.warn('[CacheService] Failed to get cache stats:', error);
    return DEFAULT_CACHE_STATS;
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    return await invoke('cache_clear_all');
  } catch (error) {
    console.error('[CacheService] Failed to clear all cache:', error);
    throw error;
  }
}

export async function clearCacheByType(cacheType: CacheType): Promise<void> {
  try {
    return await invoke('cache_clear_by_type', { cacheType });
  } catch (error) {
    console.error(`[CacheService] Failed to clear cache by type ${cacheType}:`, error);
    throw error;
  }
}

export async function clearCacheByProvider(provider: string): Promise<void> {
  try {
    return await invoke('cache_clear_by_provider', { provider });
  } catch (error) {
    console.error(`[CacheService] Failed to clear cache for provider ${provider}:`, error);
    throw error;
  }
}

export async function getCacheSize(): Promise<number> {
  try {
    return await invoke<number>('cache_get_size');
  } catch (error) {
    console.warn('[CacheService] Failed to get cache size:', error);
    return 0;
  }
}

export async function configureCache(settings: CacheSettings): Promise<void> {
  try {
    return await invoke('cache_configure', { settings });
  } catch (error) {
    console.error('[CacheService] Failed to configure cache:', error);
    throw error;
  }
}

export async function warmupCache(queries: string[]): Promise<void> {
  try {
    return await invoke('cache_warmup', { queries });
  } catch (error) {
    // Warmup failure is non-critical, just log a warning
    console.warn('[CacheService] Failed to warmup cache:', error);
  }
}

export async function exportCache(): Promise<string> {
  try {
    return await invoke<string>('cache_export');
  } catch (error) {
    console.error('[CacheService] Failed to export cache:', error);
    throw error;
  }
}

export async function getCacheAnalytics(): Promise<CacheAnalytics> {
  try {
    return await invoke<CacheAnalytics>('cache_get_analytics');
  } catch (error) {
    console.warn('[CacheService] Failed to get cache analytics:', error);
    return DEFAULT_CACHE_ANALYTICS;
  }
}

export async function pruneExpiredCache(): Promise<number> {
  try {
    return await invoke<number>('cache_prune_expired');
  } catch (error) {
    console.warn('[CacheService] Failed to prune expired cache:', error);
    return 0;
  }
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

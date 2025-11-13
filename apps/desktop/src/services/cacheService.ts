/**
 * Cache Management Service
 *
 * Frontend service for interacting with cache management Tauri commands.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  CacheStats,
  CacheSettings,
  CacheAnalytics,
  CacheType,
} from '../types/cache';

/**
 * Get comprehensive cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>('cache_get_stats');
}

/**
 * Clear all cache entries
 */
export async function clearAllCache(): Promise<void> {
  return invoke('cache_clear_all');
}

/**
 * Clear cache entries by type
 * @param cacheType - The type of cache to clear ('llm', 'tool', or 'codebase')
 */
export async function clearCacheByType(cacheType: CacheType): Promise<void> {
  return invoke('cache_clear_by_type', { cacheType });
}

/**
 * Clear cache entries by provider
 * @param provider - The LLM provider (e.g., 'openai', 'anthropic', 'google')
 */
export async function clearCacheByProvider(provider: string): Promise<void> {
  return invoke('cache_clear_by_provider', { provider });
}

/**
 * Get total cache size in MB
 */
export async function getCacheSize(): Promise<number> {
  return invoke<number>('cache_get_size');
}

/**
 * Configure cache settings
 * @param settings - Cache configuration settings
 */
export async function configureCache(settings: CacheSettings): Promise<void> {
  return invoke('cache_configure', { settings });
}

/**
 * Warm up cache with common queries
 * @param queries - Array of query strings to pre-cache
 */
export async function warmupCache(queries: string[]): Promise<void> {
  return invoke('cache_warmup', { queries });
}

/**
 * Export cache entries for backup
 * @returns JSON string containing all cache entries
 */
export async function exportCache(): Promise<string> {
  return invoke<string>('cache_export');
}

/**
 * Get cache analytics (most cached queries, biggest savings)
 */
export async function getCacheAnalytics(): Promise<CacheAnalytics> {
  return invoke<CacheAnalytics>('cache_get_analytics');
}

/**
 * Manually prune expired cache entries
 * @returns Number of entries pruned
 */
export async function pruneExpiredCache(): Promise<number> {
  return invoke<number>('cache_prune_expired');
}

/**
 * Cache service utilities
 */
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

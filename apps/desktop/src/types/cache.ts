/**
 * Cache Management Types
 *
 * TypeScript interfaces for cache management commands.
 * These types correspond to the Rust structs in src-tauri/src/commands/cache.rs
 */

/**
 * Statistics for a specific cache type
 */
export interface CacheTypeStats {
  hits: number;
  misses: number;
  hit_rate: number;
  size_mb: number;
  entries: number;
  savings_usd?: number; // For LLM cache only
}

/**
 * Overall cache statistics across all cache types
 */
export interface CacheStats {
  llm_cache: CacheTypeStats;
  tool_cache: CacheTypeStats;
  codebase_cache: CacheTypeStats;
  total_size_mb: number;
  total_savings_usd: number;
}

/**
 * Cache configuration settings
 */
export interface CacheSettings {
  ttl_seconds?: number;
  max_entries?: number;
  enabled?: boolean;
}

/**
 * Information about a frequently cached query
 */
export interface CachedQueryInfo {
  prompt_hash: string;
  provider: string;
  model: string;
  hit_count: number;
  cost_saved: number;
  last_used: string;
}

/**
 * Cache breakdown by provider
 */
export interface ProviderCacheBreakdown {
  provider: string;
  entries: number;
  total_hits: number;
  cost_saved: number;
}

/**
 * Cache analytics data
 */
export interface CacheAnalytics {
  most_cached_queries: CachedQueryInfo[];
  provider_breakdown: ProviderCacheBreakdown[];
  total_cost_saved: number;
  total_tokens_saved: number;
}

/**
 * Cache type options
 */
export type CacheType = 'llm' | 'tool' | 'codebase';

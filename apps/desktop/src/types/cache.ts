export interface CacheTypeStats {
  hits: number;
  misses: number;
  hit_rate: number;
  size_mb: number;
  entries: number;
  savings_usd?: number;
}

export interface CacheStats {
  llm_cache: CacheTypeStats;
  tool_cache: CacheTypeStats;
  codebase_cache: CacheTypeStats;
  total_size_mb: number;
  total_savings_usd: number;
}

export interface CacheSettings {
  ttl_seconds?: number;
  max_entries?: number;
  enabled?: boolean;
}

export interface CachedQueryInfo {
  prompt_hash: string;
  provider: string;
  model: string;
  hit_count: number;
  cost_saved: number;
  last_used: string;
}

export interface ProviderCacheBreakdown {
  provider: string;
  entries: number;
  total_hits: number;
  cost_saved: number;
}

export interface CacheAnalytics {
  most_cached_queries: CachedQueryInfo[];
  provider_breakdown: ProviderCacheBreakdown[];
  total_cost_saved: number;
  total_tokens_saved: number;
}

export type CacheType = 'llm' | 'tool' | 'codebase';

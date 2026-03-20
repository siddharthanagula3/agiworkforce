/**
 * Cache API — Tauri command wrappers for cache.rs
 *
 * Covers all 22 commands:
 *   cache_get_stats, cache_clear_all, cache_clear_by_type, cache_clear_by_provider,
 *   cache_get_size, cache_configure, cache_warmup, cache_export, cache_get_analytics,
 *   cache_prune_expired, codebase_cache_get_stats, codebase_cache_clear_project,
 *   codebase_cache_clear_file, codebase_cache_clear_all, codebase_cache_clear_expired,
 *   codebase_cache_get_file_tree, codebase_cache_set_file_tree,
 *   codebase_cache_get_symbols, codebase_cache_set_symbols,
 *   codebase_cache_get_dependencies, codebase_cache_set_dependencies,
 *   codebase_cache_calculate_hash
 */

import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types — LLM / Tool / Aggregate Cache (mirrors Rust structs in cache.rs)
// =============================================================================

export interface CacheTypeStats {
  hits: number;
  misses: number;
  hit_rate: number;
  size_mb: number;
  entries: number;
  savings_usd: number | null;
}

export interface CacheStats {
  llm_cache: CacheTypeStats;
  tool_cache: CacheTypeStats;
  codebase_cache: CacheTypeStats;
  total_size_mb: number;
  total_savings_usd: number;
}

export interface CacheSettings {
  ttlSeconds: number | null;
  maxEntries: number | null;
  enabled: boolean | null;
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

// =============================================================================
// Types — Codebase Cache (re-exported from cacheStore for convenience)
// =============================================================================

export interface FileTreeEntry {
  path: string;
  is_dir: boolean;
  size_bytes: number;
  modified_at: number;
  children: string[];
}

export interface FileTree {
  root: string;
  entries: FileTreeEntry[];
  total_files: number;
  total_dirs: number;
  total_size_bytes: number;
}

export type SymbolKind =
  | 'Function'
  | 'Class'
  | 'Interface'
  | 'Struct'
  | 'Enum'
  | 'Variable'
  | 'Constant'
  | 'Method'
  | 'Property'
  | 'Module'
  | 'Type';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  line: number;
  column: number;
  signature?: string;
  documentation?: string;
  scope: string;
}

export interface ImportInfo {
  module: string;
  items: string[];
  alias?: string;
  line: number;
}

export interface ExportInfo {
  name: string;
  kind: SymbolKind;
  line: number;
}

export interface SymbolTable {
  file_path?: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
}

export type NodeType = 'file' | 'module' | 'package';
export type EdgeType = 'import' | 'require' | 'include' | 'extend' | 'implement';

export interface DependencyNode {
  path: string;
  node_type: NodeType;
  external: boolean;
}

export interface DependencyEdge {
  from: string;
  to: string;
  edge_type: EdgeType;
}

export interface DependencyGraph {
  root: string;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface CodebaseCacheStats {
  total_entries: number;
  entries_by_type: Record<string, number>;
  total_size_bytes: number;
  hit_rate: number;
  miss_rate: number;
  oldest_entry?: number;
  newest_entry?: number;
}

// =============================================================================
// LLM / Tool / Aggregate Cache Commands
// =============================================================================

/** Get aggregate cache stats across LLM, tool, and codebase caches. */
export async function cacheGetStats(): Promise<CacheStats> {
  try {
    return await invoke<CacheStats>('cache_get_stats');
  } catch (error) {
    throw new Error(`Failed to get cache stats: ${error}`);
  }
}

/** Clear all LLM cache entries. */
export async function cacheClearAll(): Promise<void> {
  try {
    await invoke('cache_clear_all');
  } catch (error) {
    throw new Error(`Failed to clear all cache: ${error}`);
  }
}

/** Clear cache entries by type: 'llm' | 'tool' | 'codebase'. */
export async function cacheClearByType(cacheType: string): Promise<void> {
  try {
    await invoke('cache_clear_by_type', { cacheType });
  } catch (error) {
    throw new Error(`Failed to clear cache type "${cacheType}": ${error}`);
  }
}

/** Clear cache entries for a specific LLM provider. */
export async function cacheClearByProvider(provider: string): Promise<void> {
  try {
    await invoke('cache_clear_by_provider', { provider });
  } catch (error) {
    throw new Error(`Failed to clear cache for provider "${provider}": ${error}`);
  }
}

/** Get total cache size in MB. */
export async function cacheGetSize(): Promise<number> {
  try {
    return await invoke<number>('cache_get_size');
  } catch (error) {
    throw new Error(`Failed to get cache size: ${error}`);
  }
}

/** Update cache configuration (TTL, max entries, enabled). */
export async function cacheConfigure(settings: CacheSettings): Promise<void> {
  try {
    await invoke('cache_configure', { settings });
  } catch (error) {
    throw new Error(`Failed to configure cache: ${error}`);
  }
}

/** Warm up cache with a list of common queries. */
export async function cacheWarmup(queries: string[]): Promise<void> {
  try {
    await invoke('cache_warmup', { queries });
  } catch (error) {
    throw new Error(`Failed to warm up cache: ${error}`);
  }
}

/** Export all cache entries as a JSON string. */
export async function cacheExport(): Promise<string> {
  try {
    return await invoke<string>('cache_export');
  } catch (error) {
    throw new Error(`Failed to export cache: ${error}`);
  }
}

/** Get detailed cache analytics: top queries, provider breakdown, savings. */
export async function cacheGetAnalytics(): Promise<CacheAnalytics> {
  try {
    return await invoke<CacheAnalytics>('cache_get_analytics');
  } catch (error) {
    throw new Error(`Failed to get cache analytics: ${error}`);
  }
}

/** Prune expired cache entries. Returns the number of entries removed. */
export async function cachePruneExpired(): Promise<number> {
  try {
    return await invoke<number>('cache_prune_expired');
  } catch (error) {
    throw new Error(`Failed to prune expired cache: ${error}`);
  }
}

// =============================================================================
// Codebase Cache Commands
// =============================================================================

/** Get codebase cache statistics. */
export async function codebaseCacheGetStats(): Promise<CodebaseCacheStats> {
  try {
    return await invoke<CodebaseCacheStats>('codebase_cache_get_stats');
  } catch (error) {
    throw new Error(`Failed to get codebase cache stats: ${error}`);
  }
}

/** Clear cached data for a specific project. Returns deleted entry count. */
export async function codebaseCacheClearProject(projectPath: string): Promise<number> {
  try {
    return await invoke<number>('codebase_cache_clear_project', { projectPath });
  } catch (error) {
    throw new Error(`Failed to clear project cache: ${error}`);
  }
}

/** Clear cached data for a specific file. Returns deleted entry count. */
export async function codebaseCacheClearFile(filePath: string): Promise<number> {
  try {
    return await invoke<number>('codebase_cache_clear_file', { filePath });
  } catch (error) {
    throw new Error(`Failed to clear file cache: ${error}`);
  }
}

/** Clear all codebase cache entries. Returns deleted entry count. */
export async function codebaseCacheClearAll(): Promise<number> {
  try {
    return await invoke<number>('codebase_cache_clear_all');
  } catch (error) {
    throw new Error(`Failed to clear all codebase cache: ${error}`);
  }
}

/** Clear expired codebase cache entries. Returns deleted entry count. */
export async function codebaseCacheClearExpired(): Promise<number> {
  try {
    return await invoke<number>('codebase_cache_clear_expired');
  } catch (error) {
    throw new Error(`Failed to clear expired codebase cache: ${error}`);
  }
}

/** Get cached file tree for a project. Returns null if not cached. */
export async function codebaseCacheGetFileTree(projectPath: string): Promise<FileTree | null> {
  try {
    return await invoke<FileTree | null>('codebase_cache_get_file_tree', { projectPath });
  } catch (error) {
    throw new Error(`Failed to get file tree cache: ${error}`);
  }
}

/** Store a file tree in the codebase cache. */
export async function codebaseCacheSetFileTree(
  projectPath: string,
  fileTree: FileTree,
): Promise<void> {
  try {
    await invoke('codebase_cache_set_file_tree', { projectPath, fileTree });
  } catch (error) {
    throw new Error(`Failed to set file tree cache: ${error}`);
  }
}

/** Get cached symbols for a file. Returns null if not cached. */
export async function codebaseCacheGetSymbols(
  filePath: string,
  fileHash?: string,
): Promise<SymbolTable | null> {
  try {
    return await invoke<SymbolTable | null>('codebase_cache_get_symbols', {
      filePath,
      fileHash: fileHash ?? null,
    });
  } catch (error) {
    throw new Error(`Failed to get symbols cache: ${error}`);
  }
}

/** Store symbols in the codebase cache. */
export async function codebaseCacheSetSymbols(
  filePath: string,
  symbols: SymbolTable,
  fileHash?: string,
): Promise<void> {
  try {
    await invoke('codebase_cache_set_symbols', {
      filePath,
      fileHash: fileHash ?? null,
      symbols,
    });
  } catch (error) {
    throw new Error(`Failed to set symbols cache: ${error}`);
  }
}

/** Get cached dependency graph for a project. Returns null if not cached. */
export async function codebaseCacheGetDependencies(
  projectPath: string,
): Promise<DependencyGraph | null> {
  try {
    return await invoke<DependencyGraph | null>('codebase_cache_get_dependencies', {
      projectPath,
    });
  } catch (error) {
    throw new Error(`Failed to get dependencies cache: ${error}`);
  }
}

/** Store a dependency graph in the codebase cache. */
export async function codebaseCacheSetDependencies(
  projectPath: string,
  dependencies: DependencyGraph,
): Promise<void> {
  try {
    await invoke('codebase_cache_set_dependencies', { projectPath, dependencies });
  } catch (error) {
    throw new Error(`Failed to set dependencies cache: ${error}`);
  }
}

/** Calculate a file hash for cache invalidation. */
export async function codebaseCacheCalculateHash(content: number[]): Promise<string> {
  try {
    return await invoke<string>('codebase_cache_calculate_hash', { content });
  } catch (error) {
    throw new Error(`Failed to calculate file hash: ${error}`);
  }
}

// =============================================================================
// Client class for structured access
// =============================================================================

export const CacheClient = {
  // Aggregate
  getStats: cacheGetStats,
  clearAll: cacheClearAll,
  clearByType: cacheClearByType,
  clearByProvider: cacheClearByProvider,
  getSize: cacheGetSize,
  configure: cacheConfigure,
  warmup: cacheWarmup,
  export: cacheExport,
  getAnalytics: cacheGetAnalytics,
  pruneExpired: cachePruneExpired,

  // Codebase
  codebase: {
    getStats: codebaseCacheGetStats,
    clearProject: codebaseCacheClearProject,
    clearFile: codebaseCacheClearFile,
    clearAll: codebaseCacheClearAll,
    clearExpired: codebaseCacheClearExpired,
    getFileTree: codebaseCacheGetFileTree,
    setFileTree: codebaseCacheSetFileTree,
    getSymbols: codebaseCacheGetSymbols,
    setSymbols: codebaseCacheSetSymbols,
    getDependencies: codebaseCacheGetDependencies,
    setDependencies: codebaseCacheSetDependencies,
    calculateHash: codebaseCacheCalculateHash,
  },
} as const;

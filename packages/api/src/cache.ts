/**
 * Cache API — typed wrappers for cache_* and codebase_cache_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface CacheTypeStats {
  entries: number;
  hitRate: number;
  sizeMb: number;
}

export interface CacheStats {
  llmCache: CacheTypeStats;
  toolCache: CacheTypeStats;
  codebaseCache: CacheTypeStats;
  totalSizeMb: number;
  totalSavingsUsd: number;
}

export interface CacheSettings {
  enabled: boolean;
  maxSizeMb: number;
  ttlSeconds: number;
  [key: string]: unknown;
}

export interface CacheAnalytics {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  savingsUsd: number;
  topQueries: string[];
}

export interface FileTree {
  [key: string]: unknown;
}

export interface SymbolTable {
  [key: string]: unknown;
}

export interface DependencyGraph {
  [key: string]: unknown;
}

// ---- LLM/Tool Cache ----

export async function cacheGetStats(): Promise<CacheStats> {
  return command<CacheStats>('cache_get_stats');
}

export async function cacheClearAll(): Promise<void> {
  return command<void>('cache_clear_all');
}

export async function cacheClearByType(cacheType: string): Promise<void> {
  return command<void>('cache_clear_by_type', { cacheType });
}

export async function cacheClearByProvider(provider: string): Promise<void> {
  return command<void>('cache_clear_by_provider', { provider });
}

export async function cacheGetSize(): Promise<number> {
  return command<number>('cache_get_size');
}

export async function cacheConfigure(settings: CacheSettings): Promise<void> {
  return command<void>('cache_configure', { settings });
}

export async function cacheWarmup(queries: string[]): Promise<void> {
  return command<void>('cache_warmup', { queries });
}

export async function cacheExport(): Promise<string> {
  return command<string>('cache_export');
}

export async function cacheGetAnalytics(): Promise<CacheAnalytics> {
  return command<CacheAnalytics>('cache_get_analytics');
}

export async function cachePruneExpired(): Promise<number> {
  return command<number>('cache_prune_expired');
}

// ---- Codebase Cache ----

export async function codebaseCacheGetStats(): Promise<CacheStats> {
  return command<CacheStats>('codebase_cache_get_stats');
}

export async function codebaseCacheClearProject(projectPath: string): Promise<number> {
  return command<number>('codebase_cache_clear_project', { projectPath });
}

export async function codebaseCacheClearFile(filePath: string): Promise<number> {
  return command<number>('codebase_cache_clear_file', { filePath });
}

export async function codebaseCacheClearAll(): Promise<number> {
  return command<number>('codebase_cache_clear_all');
}

export async function codebaseCacheClearExpired(): Promise<number> {
  return command<number>('codebase_cache_clear_expired');
}

export async function codebaseCacheGetFileTree(projectPath: string): Promise<FileTree | null> {
  return command<FileTree | null>('codebase_cache_get_file_tree', { projectPath });
}

export async function codebaseCacheSetFileTree(
  projectPath: string,
  fileTree: FileTree,
): Promise<void> {
  return command<void>('codebase_cache_set_file_tree', { projectPath, fileTree });
}

export async function codebaseCacheGetSymbols(
  filePath: string,
  fileHash?: string,
): Promise<SymbolTable | null> {
  return command<SymbolTable | null>('codebase_cache_get_symbols', { filePath, fileHash });
}

export async function codebaseCacheSetSymbols(
  filePath: string,
  fileHash: string | undefined,
  symbols: SymbolTable,
): Promise<void> {
  return command<void>('codebase_cache_set_symbols', { filePath, fileHash, symbols });
}

export async function codebaseCacheGetDependencies(
  projectPath: string,
): Promise<DependencyGraph | null> {
  return command<DependencyGraph | null>('codebase_cache_get_dependencies', { projectPath });
}

export async function codebaseCacheSetDependencies(
  projectPath: string,
  dependencies: DependencyGraph,
): Promise<void> {
  return command<void>('codebase_cache_set_dependencies', { projectPath, dependencies });
}

export async function codebaseCacheCalculateHash(content: number[]): Promise<string> {
  return command<string>('codebase_cache_calculate_hash', { content });
}

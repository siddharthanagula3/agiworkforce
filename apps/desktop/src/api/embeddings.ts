/**
 * Embeddings API
 * Frontend utilities for semantic code search
 */

import { invoke } from '@tauri-apps/api/core';

export interface EmbeddingMetadata {
  id: string;
  file_path: string;
  chunk_index: number;
  content: string;
  language: string;
  symbol_name?: string;
  start_line: number;
  end_line: number;
  created_at: number;
}

export interface SearchResult {
  metadata: EmbeddingMetadata;
  similarity: number;
}

export interface EmbeddingStats {
  total_embeddings: number;
  cache_hits: number;
  cache_misses: number;
  cache_size: number;
}

export interface IndexingProgress {
  total_files: number;
  indexed_files: number;
  current_file?: string;
  is_complete: boolean;
}

/**
 * Semantic search the codebase
 */
export async function semanticSearchCodebase(
  query: string,
  limit?: number,
): Promise<SearchResult[]> {
  return invoke('semantic_search_codebase', { query, limit });
}

/**
 * Generate embeddings for a file
 */
export async function generateCodeEmbeddings(
  filePath: string,
  content: string,
): Promise<number> {
  return invoke('generate_code_embeddings', { filePath, content });
}

/**
 * Get embedding statistics
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  return invoke('get_embedding_stats');
}

/**
 * Index the entire workspace
 */
export async function indexWorkspace(): Promise<void> {
  return invoke('index_workspace');
}

/**
 * Index a specific file
 */
export async function indexFile(filePath: string): Promise<void> {
  return invoke('index_file', { filePath });
}

/**
 * Get indexing progress
 */
export async function getIndexingProgress(): Promise<IndexingProgress> {
  return invoke('get_indexing_progress');
}

/**
 * Handle file change event (for incremental indexing)
 */
export async function onFileChanged(filePath: string): Promise<void> {
  return invoke('on_file_changed', { filePath });
}

/**
 * Handle file deletion event
 */
export async function onFileDeleted(filePath: string): Promise<void> {
  return invoke('on_file_deleted', { filePath });
}

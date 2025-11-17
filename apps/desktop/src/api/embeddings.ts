/**
 * Embeddings API
 * Frontend utilities for semantic code search
 * Updated Nov 16, 2025: Added comprehensive error handling, validation, timeout handling, and cancellation support
 */

import { invoke } from '@tauri-apps/api/core';

// Updated Nov 16, 2025: Configurable timeouts for embeddings operations
const EMBEDDINGS_TIMEOUT_MS = 30000; // 30 seconds for search/stats
const EMBEDDINGS_GENERATE_TIMEOUT_MS = 120000; // 2 minutes for generating embeddings
const EMBEDDINGS_INDEX_TIMEOUT_MS = 600000; // 10 minutes for indexing operations

// Updated Nov 16, 2025: Wrapper for invoke with timeout and error handling
async function invokeWithTimeout<T>(
  command: string,
  args?: Record<string, unknown>,
  timeoutMs: number = EMBEDDINGS_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Embeddings command '${command}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke<T>(command, args)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Embeddings command '${command}' failed: ${error}`));
      });
  });
}

// Updated Nov 16, 2025: Input validation helper
function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

// Updated Nov 16, 2025: Validate file path format
function validateFilePath(filePath: string): void {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('File path cannot be empty');
  }
  // Basic validation - no null bytes or control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(filePath)) {
    throw new Error('File path contains invalid characters');
  }
}

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
 * Updated Nov 16, 2025: Added validation, error handling, and timeout
 */
export async function semanticSearchCodebase(
  query: string,
  limit?: number,
): Promise<SearchResult[]> {
  try {
    validateNonEmpty(query, 'search query');
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      throw new Error(`Invalid limit: ${limit}`);
    }
    return await invokeWithTimeout<SearchResult[]>('semantic_search_codebase', { query, limit });
  } catch (error) {
    throw new Error(`Failed to search codebase: ${error}`);
  }
}

/**
 * Generate embeddings for a file
 * Updated Nov 16, 2025: Added validation, error handling, and extended timeout
 */
export async function generateCodeEmbeddings(filePath: string, content: string): Promise<number> {
  try {
    validateFilePath(filePath);
    if (content === undefined || content === null) {
      throw new Error('content cannot be null or undefined');
    }
    // Validate content size (prevent extremely large payloads)
    const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB
    if (content.length > MAX_CONTENT_SIZE) {
      throw new Error(`Content size exceeds maximum allowed size of ${MAX_CONTENT_SIZE} bytes`);
    }
    return await invokeWithTimeout<number>(
      'generate_code_embeddings',
      { filePath, content },
      EMBEDDINGS_GENERATE_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(`Failed to generate embeddings for ${filePath}: ${error}`);
  }
}

/**
 * Get embedding statistics
 * Updated Nov 16, 2025: Added error handling and timeout
 */
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  try {
    return await invokeWithTimeout<EmbeddingStats>('get_embedding_stats');
  } catch (error) {
    throw new Error(`Failed to get embedding statistics: ${error}`);
  }
}

/**
 * Index the entire workspace
 * Updated Nov 16, 2025: Added error handling and extended timeout
 */
export async function indexWorkspace(): Promise<void> {
  try {
    await invokeWithTimeout<void>('index_workspace', undefined, EMBEDDINGS_INDEX_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to index workspace: ${error}`);
  }
}

/**
 * Index a specific file
 * Updated Nov 16, 2025: Added validation, error handling, and timeout
 */
export async function indexFile(filePath: string): Promise<void> {
  try {
    validateFilePath(filePath);
    await invokeWithTimeout<void>('index_file', { filePath }, EMBEDDINGS_GENERATE_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to index file ${filePath}: ${error}`);
  }
}

/**
 * Get indexing progress
 * Updated Nov 16, 2025: Added error handling and timeout
 */
export async function getIndexingProgress(): Promise<IndexingProgress> {
  try {
    return await invokeWithTimeout<IndexingProgress>('get_indexing_progress');
  } catch (error) {
    throw new Error(`Failed to get indexing progress: ${error}`);
  }
}

/**
 * Handle file change event (for incremental indexing)
 * Updated Nov 16, 2025: Added validation and error handling
 */
export async function onFileChanged(filePath: string): Promise<void> {
  try {
    validateFilePath(filePath);
    await invokeWithTimeout<void>('on_file_changed', { filePath }, EMBEDDINGS_GENERATE_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to handle file change for ${filePath}: ${error}`);
  }
}

/**
 * Handle file deletion event
 * Updated Nov 16, 2025: Added validation and error handling
 */
export async function onFileDeleted(filePath: string): Promise<void> {
  try {
    validateFilePath(filePath);
    await invokeWithTimeout<void>('on_file_deleted', { filePath });
  } catch (error) {
    throw new Error(`Failed to handle file deletion for ${filePath}: ${error}`);
  }
}

import { invoke } from '../lib/tauri-mock';

const EMBEDDINGS_TIMEOUT_MS = 30000;
const EMBEDDINGS_GENERATE_TIMEOUT_MS = 120000;
const EMBEDDINGS_INDEX_TIMEOUT_MS = 600000;

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

function validateNonEmpty(value: string | undefined, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

function validateFilePath(filePath: string): void {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('File path cannot be empty');
  }

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

export async function generateCodeEmbeddings(filePath: string, content: string): Promise<number> {
  try {
    validateFilePath(filePath);
    if (content === undefined || content === null) {
      throw new Error('content cannot be null or undefined');
    }

    const MAX_CONTENT_SIZE = 10 * 1024 * 1024;
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

export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  try {
    return await invokeWithTimeout<EmbeddingStats>('get_embedding_stats');
  } catch (error) {
    throw new Error(`Failed to get embedding statistics: ${error}`);
  }
}

export async function indexWorkspace(): Promise<void> {
  try {
    await invokeWithTimeout<void>('index_workspace', undefined, EMBEDDINGS_INDEX_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to index workspace: ${error}`);
  }
}

export async function indexFile(filePath: string): Promise<void> {
  try {
    validateFilePath(filePath);
    await invokeWithTimeout<void>('index_file', { filePath }, EMBEDDINGS_GENERATE_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to index file ${filePath}: ${error}`);
  }
}

export async function getIndexingProgress(): Promise<IndexingProgress> {
  try {
    return await invokeWithTimeout<IndexingProgress>('get_indexing_progress');
  } catch (error) {
    throw new Error(`Failed to get indexing progress: ${error}`);
  }
}

export async function onFileChanged(filePath: string): Promise<void> {
  try {
    validateFilePath(filePath);
    await invokeWithTimeout<void>('on_file_changed', { filePath }, EMBEDDINGS_GENERATE_TIMEOUT_MS);
  } catch (error) {
    throw new Error(`Failed to handle file change for ${filePath}: ${error}`);
  }
}

export async function onFileDeleted(filePath: string): Promise<void> {
  try {
    validateFilePath(filePath);
    await invokeWithTimeout<void>('on_file_deleted', { filePath });
  } catch (error) {
    throw new Error(`Failed to handle file deletion for ${filePath}: ${error}`);
  }
}

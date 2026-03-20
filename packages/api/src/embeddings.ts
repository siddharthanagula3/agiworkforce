/**
 * Embeddings API — typed wrappers for code embedding and semantic search Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface EmbeddingStats {
  totalFiles: number;
  totalChunks: number;
  indexSize: number;
  lastUpdated: string;
}

export interface IndexingProgress {
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  percentage: number;
}

export interface SemanticSearchResult {
  filePath: string;
  content: string;
  score: number;
  lineStart: number;
  lineEnd: number;
}

// ---- Commands ----

export async function generateCodeEmbeddings(projectPath: string): Promise<void> {
  return command<void>('generate_code_embeddings', { projectPath });
}

export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  return command<EmbeddingStats>('get_embedding_stats');
}

export async function getIndexingProgress(): Promise<IndexingProgress> {
  return command<IndexingProgress>('get_indexing_progress');
}

export async function indexFile(filePath: string): Promise<void> {
  return command<void>('index_file', { filePath });
}

export async function indexWorkspace(workspacePath: string): Promise<void> {
  return command<void>('index_workspace', { workspacePath });
}

export async function onFileChanged(filePath: string): Promise<void> {
  return command<void>('on_file_changed', { filePath });
}

export async function onFileDeleted(filePath: string): Promise<void> {
  return command<void>('on_file_deleted', { filePath });
}

export async function semanticSearchCodebase(
  query: string,
  limit?: number,
): Promise<SemanticSearchResult[]> {
  return command<SemanticSearchResult[]>('semantic_search_codebase', { query, limit });
}

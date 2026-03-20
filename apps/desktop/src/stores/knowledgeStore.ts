/**
 * Knowledge Store
 *
 * Manages the knowledge base for storing and retrieving knowledge entries,
 * plus workspace embeddings (indexing, search, stats, file change tracking).
 * Backed by Tauri commands in knowledge.rs and core/embeddings/mod.rs.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Types (mirror Rust structs from knowledge.rs)
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  embedding_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeQueryResult {
  entries: KnowledgeEntry[];
  query: string;
  relevance_scores: number[];
}

// ---------------------------------------------------------------------------
// Embeddings types (mirror Rust structs from core/embeddings/mod.rs)
// ---------------------------------------------------------------------------

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
  totalEmbeddings: number;
  cacheHits: number;
  cacheMisses: number;
  cacheSize: number;
}

export interface IndexingProgress {
  totalFiles: number;
  indexedFiles: number;
  currentFile?: string;
  isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface KnowledgeState {
  isLoading: boolean;
  error: string | null;

  // Embeddings state
  embeddingStats: EmbeddingStats | null;
  indexingProgress: IndexingProgress | null;
  searchResults: SearchResult[];
  isIndexing: boolean;
  isSearching: boolean;

  // Knowledge actions
  addKnowledge: (
    content: string,
    source: string,
    metadata?: Record<string, unknown>,
  ) => Promise<string>;

  queryKnowledge: (query: string, limit?: number) => Promise<KnowledgeQueryResult>;

  clearError: () => void;

  // Embeddings actions
  /** Generate embeddings for a single file's content */
  generateCodeEmbeddings: (filePath: string, content: string) => Promise<number>;

  /** Semantic search across the indexed codebase */
  semanticSearch: (query: string, limit?: number) => Promise<SearchResult[]>;

  /** Get embedding statistics (total count, cache hits/misses) */
  fetchEmbeddingStats: () => Promise<EmbeddingStats>;

  /** Index the entire workspace */
  indexWorkspace: () => Promise<void>;

  /** Index a single file */
  indexFile: (filePath: string) => Promise<void>;

  /** Get current indexing progress */
  fetchIndexingProgress: () => Promise<IndexingProgress>;

  /** Notify backend that a file was changed (re-index) */
  onFileChanged: (filePath: string) => Promise<void>;

  /** Notify backend that a file was deleted (remove embeddings) */
  onFileDeleted: (filePath: string) => Promise<void>;
}

export const useKnowledgeStore = create<KnowledgeState>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

      // Embeddings initial state
      embeddingStats: null,
      indexingProgress: null,
      searchResults: [],
      isIndexing: false,
      isSearching: false,

      addKnowledge: async (content: string, source: string, metadata?: Record<string, unknown>) => {
        set({ isLoading: true, error: null }, undefined, 'knowledge/add/start');
        try {
          const id = await invoke<string>('knowledge_add', {
            content,
            source,
            metadata: metadata ?? {},
          });
          set({ isLoading: false }, undefined, 'knowledge/add/success');
          return id;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to add knowledge:', msg);
          set({ error: msg, isLoading: false }, undefined, 'knowledge/add/error');
          throw error;
        }
      },

      queryKnowledge: async (query: string, limit: number = 10) => {
        set({ isLoading: true, error: null }, undefined, 'knowledge/query/start');
        try {
          const result = await invoke<KnowledgeQueryResult>('knowledge_query', {
            query,
            limit,
          });
          set({ isLoading: false }, undefined, 'knowledge/query/success');
          return result;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to query knowledge:', msg);
          set({ error: msg, isLoading: false }, undefined, 'knowledge/query/error');
          throw error;
        }
      },

      clearError: () => {
        set({ error: null }, undefined, 'knowledge/clearError');
      },

      // -----------------------------------------------------------------------
      // Embeddings actions
      // -----------------------------------------------------------------------

      generateCodeEmbeddings: async (filePath: string, content: string): Promise<number> => {
        set({ isLoading: true, error: null }, undefined, 'embeddings/generate/start');
        try {
          const count = await invoke<number>('generate_code_embeddings', {
            filePath,
            content,
          });
          set({ isLoading: false }, undefined, 'embeddings/generate/success');
          return count;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to generate embeddings:', msg);
          set({ error: msg, isLoading: false }, undefined, 'embeddings/generate/error');
          throw error;
        }
      },

      semanticSearch: async (query: string, limit?: number): Promise<SearchResult[]> => {
        set({ isSearching: true, error: null }, undefined, 'embeddings/search/start');
        try {
          const results = await invoke<SearchResult[]>('semantic_search_codebase', {
            query,
            limit: limit ?? 10,
          });
          set(
            { searchResults: results, isSearching: false },
            undefined,
            'embeddings/search/success',
          );
          return results;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] semantic search failed:', msg);
          set(
            { error: msg, isSearching: false, searchResults: [] },
            undefined,
            'embeddings/search/error',
          );
          throw error;
        }
      },

      fetchEmbeddingStats: async (): Promise<EmbeddingStats> => {
        try {
          const raw = await invoke<{
            total_embeddings: number;
            cache_hits: number;
            cache_misses: number;
            cache_size: number;
          }>('get_embedding_stats');

          const stats: EmbeddingStats = {
            totalEmbeddings: raw.total_embeddings,
            cacheHits: raw.cache_hits,
            cacheMisses: raw.cache_misses,
            cacheSize: raw.cache_size,
          };

          set({ embeddingStats: stats }, undefined, 'embeddings/stats');
          return stats;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to get embedding stats:', msg);
          set({ error: msg }, undefined, 'embeddings/stats/error');
          throw error;
        }
      },

      indexWorkspace: async (): Promise<void> => {
        set({ isIndexing: true, error: null }, undefined, 'embeddings/indexWorkspace/start');
        try {
          await invoke('index_workspace');
          set({ isIndexing: false }, undefined, 'embeddings/indexWorkspace/success');
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to index workspace:', msg);
          set({ error: msg, isIndexing: false }, undefined, 'embeddings/indexWorkspace/error');
          throw error;
        }
      },

      indexFile: async (filePath: string): Promise<void> => {
        set({ isIndexing: true, error: null }, undefined, 'embeddings/indexFile/start');
        try {
          await invoke('index_file', { filePath });
          set({ isIndexing: false }, undefined, 'embeddings/indexFile/success');
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to index file:', msg);
          set({ error: msg, isIndexing: false }, undefined, 'embeddings/indexFile/error');
          throw error;
        }
      },

      fetchIndexingProgress: async (): Promise<IndexingProgress> => {
        try {
          const raw = await invoke<{
            total_files: number;
            indexed_files: number;
            current_file?: string;
            is_complete: boolean;
          }>('get_indexing_progress');

          const progress: IndexingProgress = {
            totalFiles: raw.total_files,
            indexedFiles: raw.indexed_files,
            currentFile: raw.current_file,
            isComplete: raw.is_complete,
          };

          set({ indexingProgress: progress }, undefined, 'embeddings/progress');
          return progress;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to get indexing progress:', msg);
          set({ error: msg }, undefined, 'embeddings/progress/error');
          throw error;
        }
      },

      onFileChanged: async (filePath: string): Promise<void> => {
        try {
          await invoke('on_file_changed', { filePath });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to handle file change:', msg);
        }
      },

      onFileDeleted: async (filePath: string): Promise<void> => {
        try {
          await invoke('on_file_deleted', { filePath });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[knowledgeStore] failed to handle file deletion:', msg);
        }
      },
    }),
    { name: 'KnowledgeStore', enabled: import.meta.env.DEV },
  ),
);

// Knowledge selectors
export const selectKnowledgeLoading = (state: KnowledgeState) => state.isLoading;
export const selectKnowledgeError = (state: KnowledgeState) => state.error;

// Embeddings selectors
export const selectEmbeddingStats = (state: KnowledgeState) => state.embeddingStats;
export const selectIndexingProgress = (state: KnowledgeState) => state.indexingProgress;
export const selectSearchResults = (state: KnowledgeState) => state.searchResults;
export const selectIsIndexing = (state: KnowledgeState) => state.isIndexing;
export const selectIsSearching = (state: KnowledgeState) => state.isSearching;

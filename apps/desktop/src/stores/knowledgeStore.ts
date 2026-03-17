/**
 * Knowledge Store
 *
 * Manages the knowledge base for storing and retrieving knowledge entries.
 * Supports adding content with metadata and querying with keyword matching.
 * Backed by Tauri commands in knowledge.rs.
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
// Store
// ---------------------------------------------------------------------------

interface KnowledgeState {
  isLoading: boolean;
  error: string | null;

  // Actions
  addKnowledge: (
    content: string,
    source: string,
    metadata?: Record<string, unknown>,
  ) => Promise<string>;

  queryKnowledge: (query: string, limit?: number) => Promise<KnowledgeQueryResult>;

  clearError: () => void;
}

export const useKnowledgeStore = create<KnowledgeState>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

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
    }),
    { name: 'KnowledgeStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectKnowledgeLoading = (state: KnowledgeState) => state.isLoading;
export const selectKnowledgeError = (state: KnowledgeState) => state.error;

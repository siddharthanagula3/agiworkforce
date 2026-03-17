/**
 * Chat Memory Integration Store
 *
 * Bridges memory system with chat interactions: loading project memories for
 * context injection, detecting and saving decisions from chat, configuring
 * memory injection, logging milestones/actions, and searching memories for
 * chat context.
 *
 * Backed by Tauri commands in chat_memory_integration.rs.
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';
import type { MemoryEntry } from './memoryStore';

// ---------------------------------------------------------------------------
// Types (mirror Rust structs)
// ---------------------------------------------------------------------------

export interface LoadProjectMemoriesResponse {
  memories: MemoryEntry[];
  context_summary: string;
  memory_count: number;
}

export interface SaveDecisionResponse {
  memory_id: number;
  category: string;
  topic: string;
  content: string;
  auto_detected: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ChatMemoryState {
  isLoading: boolean;
  error: string | null;

  // Load memories for chat context injection
  loadProjectMemories: () => Promise<LoadProjectMemoriesResponse>;

  // Decision detection and saving
  detectAndSaveDecision: (message: string) => Promise<SaveDecisionResponse | null>;
  saveDecision: (message: string) => Promise<SaveDecisionResponse>;

  // Memory injection configuration
  configureMemoryInjection: (
    enabled: boolean,
    maxMemories: number,
    minImportance: number,
  ) => Promise<void>;

  // Dashboard and review
  getMemoryDashboard: () => Promise<Record<string, unknown>>;
  suggestMemoriesForReview: () => Promise<Record<string, unknown>>;

  // Session memory prefetch
  prefetchSessionMemories: () => Promise<string>;

  // Logging
  logMilestone: (description: string, metadata?: Record<string, unknown>) => Promise<number>;
  logAction: (action: string, metadata?: Record<string, unknown>) => Promise<number>;

  // Recall and search
  recallMemory: (
    category: string,
    topic: string,
    boostImportance?: boolean,
  ) => Promise<MemoryEntry | null>;
  searchMemories: (query: string, limit?: number) => Promise<MemoryEntry[]>;

  clearError: () => void;
}

export const useChatMemoryStore = create<ChatMemoryState>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

      loadProjectMemories: async () => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/loadProject/start');
        try {
          const response = await invoke<LoadProjectMemoriesResponse>('chat_load_project_memories');
          set({ isLoading: false }, undefined, 'chatMemory/loadProject/success');
          return response;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to load project memories:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/loadProject/error');
          throw error;
        }
      },

      detectAndSaveDecision: async (message: string) => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/detectDecision/start');
        try {
          const result = await invoke<SaveDecisionResponse | null>(
            'chat_detect_and_save_decision',
            { message },
          );
          set({ isLoading: false }, undefined, 'chatMemory/detectDecision/success');
          if (result) {
            toast.success('Decision detected and saved to memory');
          }
          return result;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to detect decision:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/detectDecision/error');
          throw error;
        }
      },

      saveDecision: async (message: string) => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/saveDecision/start');
        try {
          const result = await invoke<SaveDecisionResponse>('chat_save_decision', {
            message,
          });
          set({ isLoading: false }, undefined, 'chatMemory/saveDecision/success');
          toast.success('Decision saved to memory');
          return result;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to save decision:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/saveDecision/error');
          toast.error(`Failed to save decision: ${msg}`);
          throw error;
        }
      },

      configureMemoryInjection: async (
        enabled: boolean,
        maxMemories: number,
        minImportance: number,
      ) => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/configureInjection/start');
        try {
          await invoke<void>('chat_configure_memory_injection', {
            enabled,
            maxMemories,
            minImportance,
          });
          set({ isLoading: false }, undefined, 'chatMemory/configureInjection/success');
          toast.success('Memory injection settings updated');
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to configure injection:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/configureInjection/error');
          toast.error(`Failed to update memory injection: ${msg}`);
          throw error;
        }
      },

      getMemoryDashboard: async () => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/dashboard/start');
        try {
          const dashboard = await invoke<Record<string, unknown>>('chat_get_memory_dashboard');
          set({ isLoading: false }, undefined, 'chatMemory/dashboard/success');
          return dashboard;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to get dashboard:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/dashboard/error');
          throw error;
        }
      },

      suggestMemoriesForReview: async () => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/suggest/start');
        try {
          const suggestions = await invoke<Record<string, unknown>>(
            'chat_suggest_memories_for_review',
          );
          set({ isLoading: false }, undefined, 'chatMemory/suggest/success');
          return suggestions;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to suggest memories:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/suggest/error');
          throw error;
        }
      },

      prefetchSessionMemories: async () => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/prefetch/start');
        try {
          const context = await invoke<string>('chat_prefetch_session_memories');
          set({ isLoading: false }, undefined, 'chatMemory/prefetch/success');
          return context;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to prefetch session:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/prefetch/error');
          throw error;
        }
      },

      logMilestone: async (description: string, metadata?: Record<string, unknown>) => {
        try {
          const id = await invoke<number>('chat_log_milestone', {
            description,
            metadata: metadata ?? null,
          });
          return id;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to log milestone:', msg);
          throw error;
        }
      },

      logAction: async (action: string, metadata?: Record<string, unknown>) => {
        try {
          const id = await invoke<number>('chat_log_action', {
            action,
            metadata: metadata ?? null,
          });
          return id;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to log action:', msg);
          throw error;
        }
      },

      recallMemory: async (category: string, topic: string, boostImportance?: boolean) => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/recall/start');
        try {
          const entry = await invoke<MemoryEntry | null>('chat_recall_memory', {
            category,
            topic,
            boostImportance: boostImportance ?? null,
          });
          set({ isLoading: false }, undefined, 'chatMemory/recall/success');
          return entry;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to recall memory:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/recall/error');
          throw error;
        }
      },

      searchMemories: async (query: string, limit?: number) => {
        set({ isLoading: true, error: null }, undefined, 'chatMemory/search/start');
        try {
          const results = await invoke<MemoryEntry[]>('chat_search_memories', {
            query,
            limit: limit ?? null,
          });
          set({ isLoading: false }, undefined, 'chatMemory/search/success');
          return results;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[chatMemoryStore] failed to search memories:', msg);
          set({ error: msg, isLoading: false }, undefined, 'chatMemory/search/error');
          throw error;
        }
      },

      clearError: () => {
        set({ error: null }, undefined, 'chatMemory/clearError');
      },
    }),
    { name: 'ChatMemoryStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectChatMemoryLoading = (state: ChatMemoryState) => state.isLoading;
export const selectChatMemoryError = (state: ChatMemoryState) => state.error;

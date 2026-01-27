/**
 * Memory Store
 *
 * Manages persistent memory for the AI assistant, including preferences,
 * facts, decisions, and context. Uses SQLite via Tauri commands for storage.
 *
 * Zustand v5 patterns:
 * - Middleware composition: devtools(persist(...))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version
 * - Better devtools integration with store name
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';

export type MemoryCategory = 'preference' | 'fact' | 'decision' | 'context';

export interface MemoryEntry {
  id: number;
  category: MemoryCategory;
  topic: string;
  content: string;
  importance: number;
  source?: string;
  created_at: string;
  updated_at: string;
}

interface MemoryState {
  memories: MemoryEntry[];
  isLoading: boolean;
  error: string | null;

  // Hydration tracking for persist middleware
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Actions
  remember: (
    category: MemoryCategory,
    topic: string,
    content: string,
    importance?: number,
  ) => Promise<number>;
  recall: (category: MemoryCategory, topic: string) => Promise<MemoryEntry | null>;
  search: (query: string, limit?: number) => Promise<MemoryEntry[]>;
  forget: (category: MemoryCategory, topic: string) => Promise<boolean>;
  getByCategory: (category: MemoryCategory) => Promise<MemoryEntry[]>;
  getImportant: (minImportance?: number) => Promise<MemoryEntry[]>;
  getSessionContext: () => Promise<string>;
  loadAll: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

// Version for storage migration
const MEMORY_STORE_VERSION = 1;

export const useMemoryStore = create<MemoryState>()(
  devtools(
    persist(
      (set, get) => ({
        memories: [],
        isLoading: false,
        error: null,
        _hasHydrated: false,

        setHasHydrated: (state: boolean) => {
          set({ _hasHydrated: state }, undefined, 'memory/setHasHydrated');
        },

        remember: async (
          category: MemoryCategory,
          topic: string,
          content: string,
          importance: number = 5,
        ) => {
          set({ isLoading: true, error: null }, undefined, 'memory/remember/start');

          try {
            const id = await invoke<number>('memory_remember', {
              category,
              topic,
              content,
              importance,
            });

            // Refresh memories list after adding
            await get().loadAll();

            set({ isLoading: false }, undefined, 'memory/remember/success');
            return id;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to remember:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/remember/error');
            toast.error(`Failed to save memory: ${message}`);
            throw error;
          }
        },

        recall: async (category: MemoryCategory, topic: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/recall/start');

          try {
            const entry = await invoke<MemoryEntry | null>('memory_recall', {
              category,
              topic,
            });

            set({ isLoading: false }, undefined, 'memory/recall/success');
            return entry;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to recall:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/recall/error');
            throw error;
          }
        },

        search: async (query: string, limit: number = 10) => {
          set({ isLoading: true, error: null }, undefined, 'memory/search/start');

          try {
            const results = await invoke<MemoryEntry[]>('memory_search', {
              query,
              limit,
            });

            set({ isLoading: false }, undefined, 'memory/search/success');
            return results;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to search:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/search/error');
            throw error;
          }
        },

        forget: async (category: MemoryCategory, topic: string) => {
          set({ isLoading: true, error: null }, undefined, 'memory/forget/start');

          try {
            const deleted = await invoke<boolean>('memory_forget', {
              category,
              topic,
            });

            if (deleted) {
              // Refresh memories list after deleting
              await get().loadAll();
              toast.success('Memory forgotten');
            }

            set({ isLoading: false }, undefined, 'memory/forget/success');
            return deleted;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to forget:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/forget/error');
            toast.error(`Failed to forget memory: ${message}`);
            throw error;
          }
        },

        getByCategory: async (category: MemoryCategory) => {
          set({ isLoading: true, error: null }, undefined, 'memory/getByCategory/start');

          try {
            const entries = await invoke<MemoryEntry[]>('memory_get_by_category', {
              category,
            });

            set({ isLoading: false }, undefined, 'memory/getByCategory/success');
            return entries;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get by category:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/getByCategory/error');
            throw error;
          }
        },

        getImportant: async (minImportance: number = 7) => {
          set({ isLoading: true, error: null }, undefined, 'memory/getImportant/start');

          try {
            const entries = await invoke<MemoryEntry[]>('memory_get_important', {
              minImportance,
            });

            set({ isLoading: false }, undefined, 'memory/getImportant/success');
            return entries;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get important memories:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/getImportant/error');
            throw error;
          }
        },

        getSessionContext: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/getSessionContext/start');

          try {
            const context = await invoke<string>('memory_get_session_context');

            set({ isLoading: false }, undefined, 'memory/getSessionContext/success');
            return context;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to get session context:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/getSessionContext/error');
            throw error;
          }
        },

        loadAll: async () => {
          set({ isLoading: true, error: null }, undefined, 'memory/loadAll/start');

          try {
            const memories = await invoke<MemoryEntry[]>('memory_list_all');

            set({ memories, isLoading: false }, undefined, 'memory/loadAll/success');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[memoryStore] failed to load all memories:', message);
            set({ error: message, isLoading: false }, undefined, 'memory/loadAll/error');
          }
        },

        clearError: () => {
          set({ error: null }, undefined, 'memory/clearError');
        },

        reset: () => {
          set(
            {
              memories: [],
              isLoading: false,
              error: null,
            },
            undefined,
            'memory/reset',
          );
        },
      }),
      {
        name: 'agiworkforce-memory',
        version: MEMORY_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        // Only persist the memories array for offline access / quick hydration
        partialize: (state) => ({
          memories: state.memories,
        }),
        // Called when rehydration finishes (with or without errors)
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.setHasHydrated(true);
            console.log('[MemoryStore] Rehydration complete');
          }
        },
      },
    ),
    { name: 'MemoryStore', enabled: import.meta.env.DEV },
  ),
);

/**
 * Wait for memory store to finish hydrating from localStorage.
 * Use this before accessing memories that depend on persisted values.
 */
export function waitForMemoryHydration(): Promise<void> {
  return new Promise((resolve) => {
    const state = useMemoryStore.getState();
    if (state._hasHydrated) {
      resolve();
      return;
    }
    const unsub = useMemoryStore.subscribe((s) => {
      if (s._hasHydrated) {
        unsub();
        resolve();
      }
    });
  });
}

// Selectors
export const selectMemories = (state: MemoryState) => state.memories;
export const selectMemoryLoading = (state: MemoryState) => state.isLoading;
export const selectMemoryError = (state: MemoryState) => state.error;
export const selectMemoryHasHydrated = (state: MemoryState) => state._hasHydrated;

// Derived selectors
export const selectMemoriesByCategory = (category: MemoryCategory) => (state: MemoryState) =>
  state.memories.filter((m) => m.category === category);

export const selectImportantMemories =
  (minImportance: number = 7) =>
  (state: MemoryState) =>
    state.memories.filter((m) => m.importance >= minImportance);

export const selectPreferences = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'preference');

export const selectFacts = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'fact');

export const selectDecisions = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'decision');

export const selectContextMemories = (state: MemoryState) =>
  state.memories.filter((m) => m.category === 'context');

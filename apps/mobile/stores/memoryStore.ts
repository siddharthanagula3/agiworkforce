import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';
import {
  fetchMemories as apiFetchMemories,
  createMemory as apiCreateMemory,
  updateMemory as apiUpdateMemory,
  deleteMemory as apiDeleteMemory,
  searchMemories as apiSearchMemories,
  triggerSync as apiTriggerSync,
} from '@/services/memory';
import type { MemoryEntry } from '@/services/memory';

export type { MemoryEntry };

interface MemoryState {
  /** All memory entries */
  entries: MemoryEntry[];
  /** Whether memories are being fetched */
  loading: boolean;
  /** Whether a sync is in progress */
  syncing: boolean;
  /** Error message from the last failed operation */
  error: string | null;
  /** Timestamp of the last successful sync */
  lastSyncAt: string | null;
  /** Current search query */
  searchQuery: string;
  /** Entries filtered by search (populated by searchMemories or local filter) */
  filteredEntries: MemoryEntry[];

  // --- Actions ---
  fetchMemories: () => Promise<void>;
  addMemory: (content: string, category?: string) => Promise<void>;
  updateMemory: (id: string, content: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  searchMemories: (query: string) => Promise<void>;
  syncMemories: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      loading: false,
      syncing: false,
      error: null,
      lastSyncAt: null,
      searchQuery: '',
      filteredEntries: [],

      fetchMemories: async () => {
        set({ loading: true, error: null });
        try {
          const entries = await apiFetchMemories();
          set({ entries, loading: false });

          // Re-apply local search filter if active
          const { searchQuery } = get();
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            set({
              filteredEntries: entries.filter((e) => e.content.toLowerCase().includes(q)),
            });
          } else {
            set({ filteredEntries: [] });
          }
        } catch (error) {
          console.warn('Failed to fetch memories:', error);
          set({
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to fetch memories',
          });
        }
      },

      addMemory: async (content, category) => {
        set({ error: null });
        try {
          const memory = await apiCreateMemory(content, category);
          set((state) => ({
            entries: [memory, ...state.entries],
          }));
        } catch (error) {
          console.warn('Failed to add memory:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to add memory',
          });
        }
      },

      updateMemory: async (id, content) => {
        set({ error: null });

        // Optimistic update
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === id ? { ...e, content, updatedAt: new Date().toISOString() } : e,
          ),
        }));

        try {
          const updated = await apiUpdateMemory(id, content);
          set((state) => ({
            entries: state.entries.map((e) => (e.id === id ? updated : e)),
          }));
        } catch (error) {
          console.warn('Failed to update memory:', error);
          // Revert will happen on next fetch
          set({
            error: error instanceof Error ? error.message : 'Failed to update memory',
          });
        }
      },

      deleteMemory: async (id) => {
        set({ error: null });

        // Optimistic removal — save both for rollback
        const previousEntries = get().entries;
        const previousFiltered = get().filteredEntries;
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
          filteredEntries: state.filteredEntries.filter((e) => e.id !== id),
        }));

        try {
          await apiDeleteMemory(id);
        } catch (error) {
          console.warn('Failed to delete memory:', error);
          // Revert both entries and filteredEntries on failure
          set({
            entries: previousEntries,
            filteredEntries: previousFiltered,
            error: error instanceof Error ? error.message : 'Failed to delete memory',
          });
        }
      },

      searchMemories: async (query) => {
        if (!query.trim()) {
          set({ filteredEntries: [], searchQuery: '' });
          return;
        }

        set({ searchQuery: query, error: null });

        try {
          const results = await apiSearchMemories(query);
          set({ filteredEntries: results });
        } catch (error) {
          console.warn('Failed to search memories:', error);
          // Fall back to local filtering
          const q = query.toLowerCase();
          set((state) => ({
            filteredEntries: state.entries.filter((e) => e.content.toLowerCase().includes(q)),
            error: error instanceof Error ? error.message : 'Failed to search memories',
          }));
        }
      },

      syncMemories: async () => {
        set({ syncing: true, error: null });
        try {
          await apiTriggerSync();
          const entries = await apiFetchMemories();
          set({
            entries,
            syncing: false,
            lastSyncAt: new Date().toISOString(),
          });
        } catch (error) {
          console.warn('Failed to sync memories:', error);
          set({
            syncing: false,
            error: error instanceof Error ? error.message : 'Failed to sync memories',
          });
        }
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
        if (!query.trim()) {
          set({ filteredEntries: [] });
          return;
        }
        // Local filter while the user types
        const q = query.toLowerCase();
        set((state) => ({
          filteredEntries: state.entries.filter((e) => e.content.toLowerCase().includes(q)),
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'memory-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[memoryStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        entries: state.entries,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);

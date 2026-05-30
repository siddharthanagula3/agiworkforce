import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import {
  insertMemoryFact,
  listMemoryFacts,
  deleteMemoryFact,
  updateMemoryFact,
  togglePinMemoryFact,
  searchMemoryByText,
  searchMemoryByEmbedding,
} from '@/storage/memory';
import type { MemoryFact } from '@/storage/types';

export type { MemoryFact };

// Re-export as MemoryEntry alias for backwards compat with UI components
export type MemoryEntry = MemoryFact;

interface MemoryState {
  entries: MemoryFact[];
  filteredEntries: MemoryFact[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  // legacy compat — local-only
  syncing: boolean;
  lastSyncAt: string | null;

  fetchMemories: () => Promise<void>;
  addMemory: (fact: string, _category?: string) => Promise<void>;
  updateMemory: (id: string, fact: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  searchMemories: (query: string, embedding?: Float32Array) => Promise<void>;
  bulkInsert: (facts: string[]) => Promise<{ inserted: number; skipped: number }>;
  syncMemories: () => Promise<void>;
  clearError: () => void;
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  entries: [],
  filteredEntries: [],
  loading: false,
  error: null,
  searchQuery: '',
  syncing: false,
  lastSyncAt: null,

  fetchMemories: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await listMemoryFacts({ limit: 500 });
      set({ entries, loading: false });

      const { searchQuery } = get();
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        set({ filteredEntries: entries.filter((e) => e.fact.toLowerCase().includes(q)) });
      } else {
        set({ filteredEntries: [] });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load memories',
      });
    }
  },

  addMemory: async (fact, _category) => {
    set({ error: null });
    try {
      const id = Crypto.randomUUID();
      const newFact: Omit<MemoryFact, 'pinned'> & { pinned?: boolean } = {
        id,
        fact: fact.trim(),
        source_conversation_id: null,
        pinned: false,
        created_at: Date.now(),
      };
      await insertMemoryFact(newFact);
      set((state) => ({
        entries: [{ ...newFact, pinned: false }, ...state.entries],
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add memory' });
    }
  },

  updateMemory: async (id, fact) => {
    set({ error: null });
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, fact } : e)),
      filteredEntries: state.filteredEntries.map((e) => (e.id === id ? { ...e, fact } : e)),
    }));
    try {
      await updateMemoryFact(id, fact.trim());
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update memory' });
      await get().fetchMemories();
    }
  },

  deleteMemory: async (id) => {
    set({ error: null });
    const prev = get().entries;
    const prevFiltered = get().filteredEntries;
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      filteredEntries: state.filteredEntries.filter((e) => e.id !== id),
    }));
    try {
      await deleteMemoryFact(id);
    } catch (err) {
      set({
        entries: prev,
        filteredEntries: prevFiltered,
        error: err instanceof Error ? err.message : 'Failed to delete memory',
      });
    }
  },

  togglePin: async (id) => {
    const current = get().entries.find((e) => e.id === id);
    if (!current) return;
    const pinned = !current.pinned;
    set((state) => ({
      entries: state.entries
        .map((e) => (e.id === id ? { ...e, pinned } : e))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created_at - a.created_at),
    }));
    try {
      await togglePinMemoryFact(id, pinned);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update pin' });
      await get().fetchMemories();
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ filteredEntries: [] });
      return;
    }
    const q = query.toLowerCase();
    set((state) => ({
      filteredEntries: state.entries.filter((e) => e.fact.toLowerCase().includes(q)),
    }));
  },

  searchMemories: async (query, embedding) => {
    if (!query.trim()) {
      set({ filteredEntries: [], searchQuery: '' });
      return;
    }
    set({ searchQuery: query, error: null });
    try {
      if (embedding) {
        const ids = await searchMemoryByEmbedding(embedding);
        const allEntries = get().entries;
        const idSet = new Set(ids);
        set({ filteredEntries: allEntries.filter((e) => idSet.has(e.id)) });
      } else {
        const results = await searchMemoryByText(query);
        set({ filteredEntries: results });
      }
    } catch (err) {
      const q = query.toLowerCase();
      set((state) => ({
        filteredEntries: state.entries.filter((e) => e.fact.toLowerCase().includes(q)),
        error: err instanceof Error ? err.message : 'Search failed',
      }));
    }
  },

  bulkInsert: async (facts) => {
    let inserted = 0;
    let skipped = 0;
    for (const fact of facts) {
      const trimmed = fact.trim();
      if (trimmed.length < 3) {
        skipped++;
        continue;
      }
      try {
        const id = Crypto.randomUUID();
        await insertMemoryFact({
          id,
          fact: trimmed,
          source_conversation_id: null,
          pinned: false,
          created_at: Date.now(),
        });
        inserted++;
      } catch {
        skipped++;
      }
    }
    await get().fetchMemories();
    return { inserted, skipped };
  },

  syncMemories: async () => {
    await get().fetchMemories();
  },

  clearError: () => set({ error: null }),
}));

// ---------------------------------------------------------------------------
// Context retrieval — top-K facts for chat context injection
// ---------------------------------------------------------------------------

export async function retrieveMemoryContext(
  query: string,
  k = 5,
  embedding?: Float32Array,
): Promise<MemoryFact[]> {
  if (embedding) {
    try {
      const ids = await searchMemoryByEmbedding(embedding, k);
      if (ids.length > 0) {
        const allFacts = await listMemoryFacts({ limit: 500 });
        const idSet = new Set(ids);
        return allFacts.filter((f) => idSet.has(f.id)).slice(0, k);
      }
    } catch {
      // fall through to text search
    }
  }

  const textResults = await searchMemoryByText(query, k);
  if (textResults.length > 0) return textResults;

  // Relevance gate: only inject pinned facts when no keyword or vector match
  // is found. Unpinned, non-matching memories are not relevant to the current
  // query and must NOT be injected into the chat context.
  return listMemoryFacts({ pinned: true, limit: k });
}

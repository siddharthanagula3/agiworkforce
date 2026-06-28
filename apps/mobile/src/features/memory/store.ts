import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
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
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudMemoryStore } from '@/stores/memory/cloudMemoryStore';
import { markMemoryForSync } from '@/services/cloudSyncEngine';

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
      const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
      let entries: MemoryFact[];
      if (isCloud) {
        // ── Cloud path: read from the cloud memory store (synced via cloudSyncEngine).
        // Cloud entries use the same display type: we map CloudMemoryEntry → MemoryFact.
        // Non-deleted entries only; tombstones pending push stay in the cloud store
        // but must not appear in the list.
        const cloudEntries = useCloudMemoryStore
          .getState()
          .entries.filter((e) => !e.isDeleted)
          .map(
            (e): MemoryFact => ({
              id: e.id,
              fact: e.content,
              source_conversation_id: null,
              pinned: false,
              created_at: new Date(e.createdAt).getTime(),
            }),
          )
          .sort((a, b) => b.created_at - a.created_at);
        entries = cloudEntries;
      } else {
        // ── Local path: read from SQLite (unchanged).
        entries = await listMemoryFacts({ limit: 500 });
      }
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
      const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
      if (isCloud) {
        // ── Cloud path: write to cloud memory store + queue for push ──────────
        // TRUST BOUNDARY: local SQLite is NOT written. Cloud memory IDs are
        // UUIDv7 (collision-free, time-ordered) as required by the server contract.
        const id = uuidv7();
        const now = new Date().toISOString();
        const cloudEntry = {
          id,
          content: fact.trim(),
          category: null,
          source: 'mobile' as const,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        };
        useCloudMemoryStore.getState().upsertCloudMemory(cloudEntry);
        markMemoryForSync(id);
        // Also optimistically surface in the local store's entry list so the UI
        // reflects the add immediately without waiting for the next pull. We use
        // a synthetic MemoryFact shape (fact = content, created_at = epoch ms).
        set((state) => {
          const entry: MemoryFact = {
            id,
            fact: fact.trim(),
            source_conversation_id: null,
            pinned: false,
            created_at: Date.now(),
          };
          const q = state.searchQuery.trim().toLowerCase();
          const matchesSearch = q.length > 0 && entry.fact.toLowerCase().includes(q);
          return {
            entries: [entry, ...state.entries],
            filteredEntries: matchesSearch
              ? [entry, ...state.filteredEntries]
              : state.filteredEntries,
          };
        });
      } else {
        // ── Local path: write to SQLite (unchanged) ───────────────────────────
        const id = Crypto.randomUUID();
        const newFact: Omit<MemoryFact, 'pinned'> & { pinned?: boolean } = {
          id,
          fact: fact.trim(),
          source_conversation_id: null,
          pinned: false,
          created_at: Date.now(),
        };
        await insertMemoryFact(newFact);
        set((state) => {
          const entry = { ...newFact, pinned: false };
          // #28: also surface the new memory in the filtered view when a search is
          // active and it matches — otherwise it stays invisible until the query is
          // cleared (the screen renders filteredEntries while searching).
          const q = state.searchQuery.trim().toLowerCase();
          const matchesSearch = q.length > 0 && entry.fact.toLowerCase().includes(q);
          return {
            entries: [entry, ...state.entries],
            filteredEntries: matchesSearch
              ? [entry, ...state.filteredEntries]
              : state.filteredEntries,
          };
        });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to add memory' });
    }
  },

  updateMemory: async (id, fact) => {
    set({ error: null });
    const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

    // In cloud mode, validate the entry exists BEFORE applying optimistic update.
    if (isCloud) {
      const existing = useCloudMemoryStore.getState().entries.find((e) => e.id === id);
      if (!existing) {
        // Entry doesn't exist in cloud store — don't apply optimistic update or attempt push
        set({ error: 'Memory entry not found in cloud store' });
        return;
      }
    }

    // Optimistic update: only applies after cloud validation (or always in local mode).
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, fact } : e)),
      filteredEntries: state.filteredEntries.map((e) => (e.id === id ? { ...e, fact } : e)),
    }));

    try {
      if (isCloud) {
        // ── Cloud path ────────────────────────────────────────────────────────
        const existing = useCloudMemoryStore.getState().entries.find((e) => e.id === id);
        if (existing) {
          useCloudMemoryStore.getState().upsertCloudMemory({
            ...existing,
            content: fact.trim(),
            updatedAt: new Date().toISOString(),
          });
          markMemoryForSync(id);
        }
      } else {
        // ── Local path ────────────────────────────────────────────────────────
        await updateMemoryFact(id, fact.trim());
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update memory' });
      await get().fetchMemories();
    }
  },

  deleteMemory: async (id) => {
    set({ error: null });
    const prev = get().entries;
    const prevFiltered = get().filteredEntries;
    // Optimistic local removal from the display list.
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      filteredEntries: state.filteredEntries.filter((e) => e.id !== id),
    }));
    try {
      const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
      if (isCloud) {
        // ── Cloud path: mark as tombstone, keep in cloud store until server acks ──
        // CRITICAL: must NOT hard-delete locally before the server receives the
        // tombstone, otherwise the delete is silently lost. The sync engine's
        // pushMemory() will hard-delete after receiving the server ack.
        const existing = useCloudMemoryStore.getState().entries.find((e) => e.id === id);
        if (existing) {
          useCloudMemoryStore.getState().upsertCloudMemory({
            ...existing,
            isDeleted: true,
            updatedAt: new Date().toISOString(),
          });
          markMemoryForSync(id);
        }
        // If the entry is not in the cloud store (e.g. a local entry that leaked
        // to the display list in a previous session), nothing to push.
      } else {
        // ── Local path ────────────────────────────────────────────────────────
        await deleteMemoryFact(id);
      }
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
      filteredEntries: state.filteredEntries
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
  // TRUST BOUNDARY: in cloud mode, retrieve ONLY from the (synced) cloud memory
  // store — never read on-device SQLite, or local-only memories would leak into a
  // cloud turn. In local mode, read on-device SQLite only (below). This mirrors
  // the mode split in fetchMemories / addMemory.
  if (useChatAppModeStore.getState().appMode === 'cloud') {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return useCloudMemoryStore
      .getState()
      .entries.filter((e) => !e.isDeleted && e.content.toLowerCase().includes(q))
      .slice(0, k)
      .map((e) => ({
        id: e.id,
        fact: e.content,
        source_conversation_id: null,
        pinned: false,
        created_at: new Date(e.createdAt).getTime(),
      }));
  }

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

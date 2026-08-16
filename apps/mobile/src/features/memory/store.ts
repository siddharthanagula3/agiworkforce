import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { memoryRelevanceScore, normalizeMemoryKey } from '@agiworkforce/agent-core';
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
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';

export type { MemoryFact };

export type MemoryEntry = MemoryFact;

interface MemoryState {
  entries: MemoryFact[];
  filteredEntries: MemoryFact[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
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
  resetVisibleState: () => void;
}

function captureMemoryOperationScope(): AccountScopedUiState | null {
  return captureAccountScopedUiState(useChatAppModeStore.getState().appMode);
}

function isMemoryOperationScopeCurrent(
  scope: AccountScopedUiState | null | undefined,
): scope is AccountScopedUiState {
  return isAccountScopedUiStateCurrent(scope, useChatAppModeStore.getState().appMode);
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
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) {
      set({
        entries: [],
        filteredEntries: [],
        loading: false,
        error: null,
        searchQuery: '',
      });
      return;
    }
    set({ loading: true, error: null });
    try {
      const isCloud = operationScope.scope === 'cloud';
      let entries: MemoryFact[];
      if (isCloud) {
        const cloudEntries = useCloudMemoryStore
          .getState()
          .entries.filter((e) => !e.isDeleted)
          .map(
            (e): MemoryFact => ({
              id: e.id,
              fact: e.content,
              source_conversation_id: null,
              pinned: e.pinned,
              created_at: new Date(e.createdAt).getTime(),
            }),
          )
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created_at - a.created_at);
        entries = cloudEntries;
      } else {
        entries = await listMemoryFacts({ limit: 500 });
      }
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({ entries, loading: false });

      const { searchQuery } = get();
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        set({ filteredEntries: entries.filter((e) => e.fact.toLowerCase().includes(q)) });
      } else {
        set({ filteredEntries: [] });
      }
    } catch (err) {
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load memories',
      });
    }
  },

  addMemory: async (fact, _category) => {
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) {
      set({ error: 'Sign in to manage Cloud memories' });
      return;
    }
    set({ error: null });
    try {
      const isCloud = operationScope.scope === 'cloud';
      if (isCloud) {
        const id = uuidv7();
        const now = new Date().toISOString();
        const cloudEntry = {
          id,
          content: fact.trim(),
          category: null,
          source: 'mobile' as const,
          pinned: false,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        };
        useCloudMemoryStore.getState().upsertCloudMemory(cloudEntry);
        markMemoryForSync(id);
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
        const id = Crypto.randomUUID();
        const newFact: Omit<MemoryFact, 'pinned'> & { pinned?: boolean } = {
          id,
          fact: fact.trim(),
          source_conversation_id: null,
          pinned: false,
          created_at: Date.now(),
        };
        await insertMemoryFact(newFact);
        if (!isMemoryOperationScopeCurrent(operationScope)) return;
        set((state) => {
          const entry = { ...newFact, pinned: false };
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
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({ error: err instanceof Error ? err.message : 'Failed to add memory' });
    }
  },

  updateMemory: async (id, fact) => {
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) {
      set({ error: 'Sign in to manage Cloud memories' });
      return;
    }
    set({ error: null });
    const isCloud = operationScope.scope === 'cloud';

    if (isCloud) {
      const existing = useCloudMemoryStore.getState().entries.find((e) => e.id === id);
      if (!existing) {
        set({ error: 'Memory entry not found in cloud store' });
        return;
      }
    }

    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, fact } : e)),
      filteredEntries: state.filteredEntries.map((e) => (e.id === id ? { ...e, fact } : e)),
    }));

    try {
      if (isCloud) {
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
        await updateMemoryFact(id, fact.trim());
      }
    } catch (err) {
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({ error: err instanceof Error ? err.message : 'Failed to update memory' });
      await get().fetchMemories();
    }
  },

  deleteMemory: async (id) => {
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) {
      set({ error: 'Sign in to manage Cloud memories' });
      return;
    }
    set({ error: null });
    const prev = get().entries;
    const prevFiltered = get().filteredEntries;
    set((state) => ({
      entries: state.entries.filter((e) => e.id !== id),
      filteredEntries: state.filteredEntries.filter((e) => e.id !== id),
    }));
    try {
      const isCloud = operationScope.scope === 'cloud';
      if (isCloud) {
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
        await deleteMemoryFact(id);
      }
    } catch (err) {
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({
        entries: prev,
        filteredEntries: prevFiltered,
        error: err instanceof Error ? err.message : 'Failed to delete memory',
      });
    }
  },

  togglePin: async (id) => {
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) {
      set({ error: 'Sign in to manage Cloud memories' });
      return;
    }
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
      const isCloud = operationScope.scope === 'cloud';
      if (isCloud) {
        const existing = useCloudMemoryStore.getState().entries.find((e) => e.id === id);
        if (existing) {
          useCloudMemoryStore.getState().upsertCloudMemory({
            ...existing,
            pinned,
            updatedAt: new Date().toISOString(),
          });
          markMemoryForSync(id);
        }
      } else {
        await togglePinMemoryFact(id, pinned);
      }
    } catch (err) {
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
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

  resetVisibleState: () =>
    set({
      entries: [],
      filteredEntries: [],
      loading: false,
      error: null,
      searchQuery: '',
      syncing: false,
      lastSyncAt: null,
    }),
}));

const MEMORY_QUERY_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'do',
  'does',
  'did',
  'i',
  'you',
  'your',
  'my',
  'me',
  'in',
  'on',
  'of',
  'to',
  'for',
  'and',
  'or',
  'what',
  'which',
  'who',
  'whom',
  'this',
  'that',
  'these',
  'those',
  'be',
  'am',
  'it',
  'its',
  'with',
  'from',
  'at',
  'as',
  'but',
  'if',
  'so',
  'we',
  'they',
  'he',
  'she',
  'him',
  'her',
  'his',
  'their',
  'our',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'about',
  'between',
  'into',
  'than',
  'then',
  'there',
  'here',
  'how',
  'when',
  'where',
  'why',
  'based',
  'memory',
  'prefer',
]);

function memoryLexicalSimilarity(fact: string, query: string): number {
  const factKey = normalizeMemoryKey(fact);
  const queryKey = normalizeMemoryKey(query);
  if (!queryKey) return 0;
  if (factKey.includes(queryKey) || queryKey.includes(factKey)) return 1;
  const words = Array.from(
    new Set(
      queryKey
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !MEMORY_QUERY_STOPWORDS.has(word)),
    ),
  );
  if (words.length === 0) return 0;
  const matchingWords = words.filter((word) => factKey.includes(word)).length;
  return matchingWords / words.length;
}

export async function retrieveMemoryContext(
  query: string,
  k = 5,
  embedding?: Float32Array,
): Promise<MemoryFact[]> {
  if (useChatAppModeStore.getState().appMode === 'cloud') {
    const queryKey = normalizeMemoryKey(query);
    const activeEntries = useCloudMemoryStore.getState().entries.filter((e) => !e.isDeleted);
    const toFact = (e: (typeof activeEntries)[number]): MemoryFact => ({
      id: e.id,
      fact: e.content,
      source_conversation_id: null,
      pinned: e.pinned,
      created_at: new Date(e.createdAt).getTime(),
    });

    if (queryKey) {
      const now = Date.now();
      const ranked = activeEntries
        .map((entry) => {
          const lexicalSimilarity = memoryLexicalSimilarity(entry.content, queryKey);
          const accessedAt = Date.parse(entry.updatedAt || entry.createdAt);
          const daysSinceAccess = Number.isFinite(accessedAt)
            ? Math.max(0, (now - accessedAt) / 86_400_000)
            : 30;
          return {
            entry,
            lexicalSimilarity,
            score: memoryRelevanceScore({
              lexicalSimilarity,
              importance: entry.pinned ? 10 : 5,
              daysSinceAccess,
            }),
          };
        })
        .filter(({ lexicalSimilarity }) => lexicalSimilarity > 0)
        .sort((left, right) => right.score - left.score);
      if (ranked.length > 0) return ranked.slice(0, k).map(({ entry }) => toFact(entry));
    }

    return activeEntries
      .filter((e) => e.pinned)
      .slice(0, k)
      .map(toFact);
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

  return listMemoryFacts({ pinned: true, limit: k });
}

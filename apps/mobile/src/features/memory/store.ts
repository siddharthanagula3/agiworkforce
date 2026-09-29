import { create } from 'zustand';
import { memoryRelevanceScore, normalizeMemoryKey } from '@agiworkforce/agent-core';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import {
  listMemoryFacts,
  deleteAllMemoryFacts,
  deleteMemoryFact,
  updateMemoryFact,
  togglePinMemoryFact,
  searchMemoryByText,
  searchMemoryByEmbedding,
} from '@/storage/memory';
import type { MemoryFact, MemoryFactSource } from '@/storage/types';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudMemoryStore, type CloudMemoryEntry } from '@/stores/memory/cloudMemoryStore';
import { writeLocalMemoryFact } from '@/src/features/memory/services/localMemoryWriter';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import { api } from '@/services/api';
import { markMemoryForSync, syncNow } from '@/services/cloudSyncEngine';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { prohibitedMemoryMessage } from '@agiworkforce/context';

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
  resetMemories: () => Promise<boolean>;
  togglePin: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  searchMemories: (query: string, embedding?: Float32Array) => Promise<void>;
  bulkInsert: (
    facts: string[],
    sourceName?: string,
  ) => Promise<{ inserted: number; skipped: number }>;
  syncMemories: () => Promise<void>;
  clearError: () => void;
  resetVisibleState: () => void;
}

const RESET_FAILED_MESSAGE = 'Could not reset memory, so nothing was deleted. Try again.';
const MIN_IMPORTED_FACT_CHARS = 3;
const ALREADY_SAVED_MESSAGE = 'That memory is already saved.';

function keptExistingMessage(keeper: string | undefined): string {
  return keeper
    ? `Kept “${keeper}” instead, because it outranks the new fact. Unpin or edit it to change what is remembered.`
    : 'Kept an existing memory instead, because it outranks the new fact.';
}
const MAX_IMPORT_BATCH = 500;

interface CloudImportResult {
  insertedCount: number;
  skippedDuplicateCount: number;
  blockedCount: number;
  excludedCount: number;
}

function cloudMemoryOrigin(entry: CloudMemoryEntry): MemoryFactSource {
  const raw = entry.origin ?? entry.source;
  if (raw === 'auto') return 'learned';
  return raw.startsWith('imported') ? 'imported' : 'typed';
}

function cloudMemoryFact(entry: CloudMemoryEntry): MemoryFact {
  return {
    id: entry.id,
    fact: entry.content,
    source_conversation_id: entry.sourceConversationId ?? null,
    source_conversation_title: entry.sourceConversationTitle ?? null,
    project_id: entry.projectId ?? null,
    project_name: entry.projectName ?? null,
    pinned: entry.pinned,
    created_at: new Date(entry.createdAt).getTime(),
    updated_at: new Date(entry.updatedAt).getTime(),
    source: cloudMemoryOrigin(entry),
    category: entry.category,
  };
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
          .map(cloudMemoryFact)
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
        error: 'Could not load memories. Try again.',
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
            source: 'typed',
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
        const result = await writeLocalMemoryFact({ fact: fact.trim(), source: 'typed' });
        if (!isMemoryOperationScopeCurrent(operationScope)) return;
        if (result.refusedCategory) {
          set({ error: prohibitedMemoryMessage(result.refusedCategory) });
          return;
        }
        if (result.outcome === 'already_known' || !result.fact) {
          set({ error: ALREADY_SAVED_MESSAGE });
          return;
        }
        if (result.outcome === 'kept_existing') {
          const keeper = get().entries.find((entry) => entry.id === result.fact?.superseded_by);
          set({ error: keptExistingMessage(keeper?.fact) });
          return;
        }
        const entry = result.fact;
        const replaced = new Set(result.replacedIds);
        set((state) => {
          const q = state.searchQuery.trim().toLowerCase();
          const matchesSearch = q.length > 0 && entry.fact.toLowerCase().includes(q);
          const remaining = state.entries.filter((existing) => !replaced.has(existing.id));
          const remainingFiltered = state.filteredEntries.filter(
            (existing) => !replaced.has(existing.id),
          );
          return {
            entries: [entry, ...remaining],
            filteredEntries: matchesSearch ? [entry, ...remainingFiltered] : remainingFiltered,
          };
        });
      }
    } catch (err) {
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({ error: 'Could not add this memory. Try again.' });
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

    const editedAt = Date.now();
    set((state) => ({
      entries: state.entries.map((e) => (e.id === id ? { ...e, fact, updated_at: editedAt } : e)),
      filteredEntries: state.filteredEntries.map((e) =>
        e.id === id ? { ...e, fact, updated_at: editedAt } : e,
      ),
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
      await get().fetchMemories();
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({ error: 'Could not update this memory. Try again.' });
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
        error: 'Could not delete this memory. Try again.',
      });
    }
  },

  resetMemories: async () => {
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) {
      set({ error: 'Sign in to manage Cloud memories' });
      return false;
    }
    set({ error: null });
    try {
      if (operationScope.scope === 'cloud') {
        await api.delete('/api/memory');
        const dirtyIds = new Set(useMemorySyncStateStore.getState().dirtyMemoryIds);
        const cloudMemory = useCloudMemoryStore.getState();
        const now = new Date().toISOString();
        for (const entry of cloudMemory.entries) {
          if (dirtyIds.has(entry.id)) {
            cloudMemory.upsertCloudMemory({ ...entry, isDeleted: true, updatedAt: now });
          } else {
            cloudMemory.hardDeleteCloudMemory(entry.id);
          }
        }
        void syncNow().catch(() => undefined);
      } else {
        await deleteAllMemoryFacts();
      }
      if (isMemoryOperationScopeCurrent(operationScope)) {
        set({ entries: [], filteredEntries: [] });
      }
      return true;
    } catch {
      if (isMemoryOperationScopeCurrent(operationScope)) set({ error: RESET_FAILED_MESSAGE });
      return false;
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
      await get().fetchMemories();
      if (!isMemoryOperationScopeCurrent(operationScope)) return;
      set({ error: 'Could not update this memory. Try again.' });
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
        error: 'Could not search memories. Showing local matches instead.',
      }));
    }
  },

  bulkInsert: async (facts, sourceName = 'other') => {
    const operationScope = captureMemoryOperationScope();
    if (!operationScope) throw new Error('Sign in to manage Cloud memories');
    const candidates = facts
      .map((fact) => fact.trim())
      .filter((fact) => fact.length >= MIN_IMPORTED_FACT_CHARS);
    let inserted = 0;
    let skipped = facts.length - candidates.length;

    if (operationScope.scope === 'cloud') {
      for (let start = 0; start < candidates.length; start += MAX_IMPORT_BATCH) {
        const result = await api.post<CloudImportResult>('/api/memory/import', {
          mode: 'commit',
          items: candidates.slice(start, start + MAX_IMPORT_BATCH),
          sourceName,
        });
        inserted += result.insertedCount;
        skipped += result.skippedDuplicateCount + result.blockedCount + result.excludedCount;
      }
      await syncNow().catch(() => undefined);
      if (isMemoryOperationScopeCurrent(operationScope)) await get().fetchMemories();
      return { inserted, skipped };
    }

    let known = await listMemoryFacts({ limit: 5_000 });
    for (const trimmed of candidates) {
      try {
        const result = await writeLocalMemoryFact({ fact: trimmed, source: 'imported', known });
        if (!result.fact) {
          skipped++;
          continue;
        }
        const written = result.fact;
        known = [
          ...known.filter((entry) => !result.replacedIds.includes(entry.id)),
          ...(result.outcome === 'inserted' ? [written] : []),
        ];
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

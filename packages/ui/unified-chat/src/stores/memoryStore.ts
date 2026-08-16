import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MemoryFact {
  id: string;
  text: string;
  sourceConversationId?: string;
  createdAt: string;
  updatedAt: string;
  serverId?: string;
  /**
   * Shown immediately from an optimistic add, before the server has assigned a
   * real id. Editing or deleting one is refused because there is nothing
   * addressable to send yet; it clears when the create resolves, or the row
   * disappears when it fails.
   */
  pending?: boolean;
}

export type MemorySyncStatus = 'unavailable' | 'idle' | 'syncing' | 'synced' | 'error';

interface MemoryState {
  facts: MemoryFact[];
  syncStatus: MemorySyncStatus;
  add: (text: string, sourceConversationId?: string) => MemoryFact | null;
  update: (id: string, text: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  hydrateFromServer: () => Promise<void>;
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `mem_${globalThis.crypto.randomUUID()}`;
  }
  return `mem_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w['__TAURI__'] || w['__TAURI_INTERNALS__']);
}

function isReactNativeRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as unknown as Record<string, unknown>)['product'] === 'string' &&
    (navigator as unknown as Record<string, unknown>)['product'] === 'ReactNative'
  );
}

function canSyncToServer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof fetch === 'function' &&
    !isTauriRuntime() &&
    !isReactNativeRuntime()
  );
}

interface ServerMemoryRow {
  id: string;
  content: string;
  category: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

const MEMORY_API_BASE = '/api/memory';

let cachedCsrfToken: string | null = null;
let cachedCsrfExpiry = 0;

async function getCsrfToken(): Promise<string | null> {
  if (cachedCsrfToken && Date.now() < cachedCsrfExpiry) {
    return cachedCsrfToken;
  }
  try {
    const res = await fetch('/api/csrf', { method: 'GET' });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string; expiresIn?: number };
    if (!data.token) return null;
    cachedCsrfToken = data.token;
    cachedCsrfExpiry = Date.now() + (data.expiresIn ?? 3_600_000) - 5 * 60_000;
    return cachedCsrfToken;
  } catch {
    return null;
  }
}

async function withCsrfHeaders(
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await getCsrfToken();
  return token ? { ...headers, 'x-csrf-token': token } : headers;
}

async function fetchServerMemories(): Promise<ServerMemoryRow[] | null> {
  try {
    const res = await fetch(`${MEMORY_API_BASE}?limit=100`, { method: 'GET' });
    if (!res.ok) return null;
    const data = (await res.json()) as { memories?: ServerMemoryRow[] };
    return data.memories ?? [];
  } catch {
    return null;
  }
}

async function createServerMemory(text: string): Promise<ServerMemoryRow | null> {
  try {
    const headers = await withCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(MEMORY_API_BASE, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: text, source: 'web' }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { memory?: ServerMemoryRow };
    return data.memory ?? null;
  } catch {
    return null;
  }
}

async function updateServerMemory(serverId: string, text: string): Promise<boolean> {
  try {
    const headers = await withCsrfHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`${MEMORY_API_BASE}/${encodeURIComponent(serverId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteServerMemory(serverId: string): Promise<boolean> {
  try {
    const headers = await withCsrfHeaders();
    const res = await fetch(`${MEMORY_API_BASE}/${encodeURIComponent(serverId)}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      facts: [],
      syncStatus: canSyncToServer() ? 'idle' : 'unavailable',

      add: (text, sourceConversationId) => {
        const trimmed = text.trim();
        if (!trimmed) return null;
        const dupe = get().facts.find((f) => f.text.toLowerCase() === trimmed.toLowerCase());
        if (dupe) return dupe;
        const now = new Date().toISOString();
        const fact: MemoryFact = {
          id: randomId(),
          text: trimmed,
          sourceConversationId,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ facts: [fact, ...state.facts] }));

        if (canSyncToServer()) {
          void createServerMemory(trimmed).then((row) => {
            if (!row) return;
            const stillLocal = get().facts.some((f) => f.id === fact.id);
            if (!stillLocal) {
              void deleteServerMemory(row.id);
              return;
            }
            set((state) => ({
              facts: state.facts.map((f) =>
                f.id === fact.id ? { ...f, serverId: row.id, updatedAt: row.updatedAt } : f,
              ),
            }));
          });
        }

        return fact;
      },

      update: (id, text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const target = get().facts.find((f) => f.id === id);
        set((state) => ({
          facts: state.facts.map((f) =>
            f.id === id ? { ...f, text: trimmed, updatedAt: new Date().toISOString() } : f,
          ),
        }));
        if (canSyncToServer() && target?.serverId) {
          void updateServerMemory(target.serverId, trimmed);
        }
      },

      remove: (id) => {
        const target = get().facts.find((f) => f.id === id);
        set((state) => ({
          facts: state.facts.filter((f) => f.id !== id),
        }));
        if (canSyncToServer() && target?.serverId) {
          void deleteServerMemory(target.serverId);
        }
      },

      clear: () => {
        const toDelete = get()
          .facts.filter((f) => f.serverId)
          .map((f) => f.serverId as string);
        set({ facts: [] });
        if (canSyncToServer() && toDelete.length > 0) {
          void Promise.allSettled(toDelete.map((serverId) => deleteServerMemory(serverId)));
        }
      },

      hydrateFromServer: async () => {
        if (!canSyncToServer()) {
          set({ syncStatus: 'unavailable' });
          return;
        }
        set({ syncStatus: 'syncing' });
        const rows = await fetchServerMemories();
        if (rows === null) {
          set({ syncStatus: 'idle' });
          return;
        }

        set((state) => {
          const byServerId = new Map(
            state.facts.filter((f) => f.serverId).map((f) => [f.serverId, f]),
          );
          const unsynced = state.facts.filter((f) => !f.serverId);
          const merged: MemoryFact[] = [];

          for (const row of rows) {
            const existing = byServerId.get(row.id);
            if (existing) {
              merged.push({
                ...existing,
                text: row.content,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              });
              byServerId.delete(row.id);
              continue;
            }
            const matchIdx = unsynced.findIndex(
              (f) => f.text.toLowerCase() === row.content.toLowerCase(),
            );
            if (matchIdx !== -1) {
              const [match] = unsynced.splice(matchIdx, 1);
              if (match) {
                merged.push({ ...match, serverId: row.id, updatedAt: row.updatedAt });
                continue;
              }
            }
            merged.push({
              id: randomId(),
              text: row.content,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              serverId: row.id,
            });
          }

          merged.push(...unsynced);
          merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

          return { facts: merged, syncStatus: 'synced' };
        });
      },
    }),
    {
      name: 'agi-memory-store-v1',
      partialize: (state) => ({ facts: state.facts }),
    },
  ),
);

export const selectMemoryFacts = (s: MemoryState): MemoryFact[] => s.facts;
export const selectMemoryCount = (s: MemoryState): number => s.facts.length;
export const selectMemorySyncStatus = (s: MemoryState): MemorySyncStatus => s.syncStatus;

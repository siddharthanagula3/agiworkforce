import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  parseManagedMemoryItemResponse,
  parseManagedMemoryListResponse,
  parseManagedMemoryWriteResponse,
  type ManagedMemoryRecord,
  type ManagedMemoryWriteResponse,
} from '@agiworkforce/types';

export interface MemoryFact {
  id: string;
  text: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string | null;
  source?: string;
  category?: string | null;
  /**
   * Project this fact is confined to, if any (migration 0135). Absent means
   * global, used in every conversation. Shown in the editor so a confined
   * fact is not mistaken for one that applies everywhere.
   */
  projectId?: string | null;
  projectName?: string | null;
  createdAt: string;
  updatedAt: string;
  serverId?: string;
  pinned?: boolean;
  /**
   * Shown immediately from an optimistic add, before the server has assigned a
   * real id. Editing or deleting one is refused because there is nothing
   * addressable to send yet; it clears when the create resolves, or the row
   * disappears when it fails.
   */
  pending?: boolean;
  unsaved?: boolean;
}

export type MemorySyncStatus = 'unavailable' | 'idle' | 'syncing' | 'synced' | 'error';

export interface MemoryProjectScope {
  id: string;
  name: string;
}

interface MemoryState {
  facts: MemoryFact[];
  syncStatus: MemorySyncStatus;
  add: (
    text: string,
    sourceConversationId?: string,
    project?: MemoryProjectScope,
  ) => Promise<MemoryFact | null>;
  update: (id: string, text: string) => Promise<void>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  resetOnLogout: () => void;
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

const MEMORY_API_BASE = '/api/memory';
const MEMORY_PAGE_SIZE = MANAGED_MEMORY_MAX_PAGE_SIZE;
const MEMORY_MAX_OFFSET = 10_000;
const MEMORY_REQUEST_FAILED = 'Could not reach your memory. Nothing changed.';

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

async function memoryRequest(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new Error(MEMORY_REQUEST_FAILED);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok || body === null) {
    const message =
      body && typeof body === 'object'
        ? (body as { error?: { message?: unknown } }).error?.message
        : undefined;
    throw new Error(typeof message === 'string' && message ? message : MEMORY_REQUEST_FAILED);
  }
  return body;
}

function contractOrFail<T>(parsed: T | null): T {
  if (parsed === null) throw new Error(MEMORY_REQUEST_FAILED);
  return parsed;
}

async function fetchServerMemories(): Promise<ManagedMemoryRecord[]> {
  const rows: ManagedMemoryRecord[] = [];
  for (let offset = 0; offset <= MEMORY_MAX_OFFSET; offset += MEMORY_PAGE_SIZE) {
    const page = contractOrFail(
      parseManagedMemoryListResponse(
        await memoryRequest(`${MEMORY_API_BASE}?limit=${MEMORY_PAGE_SIZE}&offset=${offset}`, {
          method: 'GET',
        }),
      ),
    );
    rows.push(...page.memories);
    if (!page.hasMore || page.memories.length === 0) break;
  }
  return rows;
}

async function createServerMemory(
  text: string,
  projectId?: string,
): Promise<ManagedMemoryWriteResponse> {
  return contractOrFail(
    parseManagedMemoryWriteResponse(
      await memoryRequest(MEMORY_API_BASE, {
        method: 'POST',
        headers: await withCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: text, source: 'web', ...(projectId ? { projectId } : {}) }),
      }),
    ),
  );
}

async function updateServerMemory(
  serverId: string,
  patch: { content?: string; pinned?: boolean },
): Promise<ManagedMemoryRecord> {
  return contractOrFail(
    parseManagedMemoryItemResponse(
      await memoryRequest(`${MEMORY_API_BASE}/${encodeURIComponent(serverId)}`, {
        method: 'PUT',
        headers: await withCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      }),
    ),
  ).memory;
}

async function deleteServerMemory(serverId: string): Promise<void> {
  await memoryRequest(`${MEMORY_API_BASE}/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
    headers: await withCsrfHeaders(),
  });
}

async function deleteAllServerMemories(): Promise<void> {
  await memoryRequest(MEMORY_API_BASE, {
    method: 'DELETE',
    headers: await withCsrfHeaders(),
  });
}

function factFromServer(row: ManagedMemoryRecord, id: string = randomId()): MemoryFact {
  return {
    id,
    serverId: row.id,
    text: row.content,
    source: row.source ?? undefined,
    category: row.category,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    ...(row.sourceConversationId ? { sourceConversationId: row.sourceConversationId } : {}),
    sourceConversationTitle: row.sourceConversationTitle ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pinned: row.pinned === true,
  };
}

function withServerRow(fact: MemoryFact, row: ManagedMemoryRecord): MemoryFact {
  const saved = factFromServer(row, fact.id);
  return { ...saved, projectName: saved.projectName ?? fact.projectName ?? null, pending: false };
}

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      facts: [],
      syncStatus: canSyncToServer() ? 'idle' : 'unavailable',

      add: async (text, sourceConversationId, project) => {
        const trimmed = text.trim();
        if (!trimmed) return null;
        const dupe = get().facts.find(
          (f) =>
            f.text.toLowerCase() === trimmed.toLowerCase() &&
            (f.projectId ?? null) === (project?.id ?? null),
        );
        if (dupe) return dupe;
        const now = new Date().toISOString();
        const fact: MemoryFact = {
          id: randomId(),
          text: trimmed,
          ...(sourceConversationId ? { sourceConversationId } : {}),
          ...(project ? { projectId: project.id, projectName: project.name } : {}),
          createdAt: now,
          updatedAt: now,
          ...(canSyncToServer() ? { pending: true } : {}),
        };
        set((state) => ({ facts: [fact, ...state.facts] }));
        if (!canSyncToServer()) return fact;

        let created: ManagedMemoryWriteResponse;
        try {
          created = await createServerMemory(trimmed, project?.id);
        } catch (error) {
          set((state) => ({ facts: state.facts.filter((f) => f.id !== fact.id) }));
          throw error;
        }

        const superseded = new Set(created.supersededIds);
        const keeper = created.supersededBy
          ? get().facts.find((f) => f.serverId === created.supersededBy)
          : undefined;
        if (created.supersededBy) {
          set((state) => ({ facts: state.facts.filter((f) => f.id !== fact.id) }));
          throw new Error(
            keeper
              ? `Kept “${keeper.text}” instead, because it outranks the new fact. Unpin or edit it to change what is remembered.`
              : 'Kept an existing memory instead, because it outranks the new fact.',
          );
        }

        const existing = created.merged
          ? get().facts.find((f) => f.serverId === created.memory.id)
          : undefined;
        const saved = withServerRow(existing ?? fact, created.memory);
        set((state) => ({
          facts: state.facts
            .filter((f) => !(f.serverId && superseded.has(f.serverId)))
            .filter((f) => !(existing && f.id === fact.id))
            .map((f) => (f.id === saved.id ? saved : f)),
        }));
        return saved;
      },

      update: async (id, text) => {
        const trimmed = text.trim();
        const target = get().facts.find((f) => f.id === id);
        if (!trimmed || !target || target.pending) return;
        set((state) => ({
          facts: state.facts.map((f) =>
            f.id === id ? { ...f, text: trimmed, updatedAt: new Date().toISOString() } : f,
          ),
        }));
        if (!canSyncToServer() || !target.serverId) return;
        try {
          const row = await updateServerMemory(target.serverId, { content: trimmed });
          set((state) => ({
            facts: state.facts.map((f) => (f.id === id ? withServerRow(f, row) : f)),
          }));
        } catch (error) {
          set((state) => ({ facts: state.facts.map((f) => (f.id === id ? target : f)) }));
          throw error;
        }
      },

      setPinned: async (id, pinned) => {
        const target = get().facts.find((f) => f.id === id);
        if (!target || target.pending) return;
        set((state) => ({
          facts: state.facts.map((f) => (f.id === id ? { ...f, pinned } : f)),
        }));
        if (!canSyncToServer() || !target.serverId) return;
        try {
          const row = await updateServerMemory(target.serverId, { pinned });
          set((state) => ({
            facts: state.facts.map((f) => (f.id === id ? withServerRow(f, row) : f)),
          }));
        } catch (error) {
          set((state) => ({ facts: state.facts.map((f) => (f.id === id ? target : f)) }));
          throw error;
        }
      },

      remove: async (id) => {
        const facts = get().facts;
        const index = facts.findIndex((f) => f.id === id);
        const target = facts[index];
        if (!target || target.pending) return;
        set((state) => ({ facts: state.facts.filter((f) => f.id !== id) }));
        if (!canSyncToServer() || !target.serverId) return;
        try {
          await deleteServerMemory(target.serverId);
        } catch (error) {
          set((state) => {
            const next = [...state.facts];
            next.splice(Math.min(index, next.length), 0, target);
            return { facts: next };
          });
          throw error;
        }
      },

      clear: async () => {
        if (canSyncToServer()) await deleteAllServerMemories();
        set({ facts: [] });
      },

      resetOnLogout: () => {
        set({ facts: [], syncStatus: canSyncToServer() ? 'idle' : 'unavailable' });
      },

      hydrateFromServer: async () => {
        if (!canSyncToServer()) {
          set({ syncStatus: 'unavailable' });
          return;
        }
        set({ syncStatus: 'syncing' });
        let rows: ManagedMemoryRecord[];
        try {
          rows = await fetchServerMemories();
        } catch {
          set({ syncStatus: 'error' });
          return;
        }

        const serverTexts = new Set(rows.map((row) => row.content.toLowerCase()));
        const backlog = get().facts.filter(
          (f) => !f.serverId && !f.pending && !serverTexts.has(f.text.toLowerCase()),
        );
        set((state) => {
          const byServerId = new Map(
            state.facts.filter((f) => f.serverId).map((f) => [f.serverId, f]),
          );
          const facts = rows.map((row) => {
            const existing = byServerId.get(row.id);
            return existing ? withServerRow(existing, row) : factFromServer(row);
          });
          return {
            facts: [...state.facts.filter((f) => f.pending), ...backlog, ...facts],
            syncStatus: 'synced',
          };
        });

        for (const fact of backlog) {
          try {
            const created = await createServerMemory(fact.text);
            const superseded = new Set(created.supersededIds);
            set((state) => ({
              facts: state.facts
                .filter((f) => !(f.serverId && superseded.has(f.serverId)))
                .flatMap((f) => {
                  if (f.id !== fact.id) return [f];
                  if (created.supersededBy) return [];
                  if (state.facts.some((other) => other.serverId === created.memory.id)) return [];
                  return [withServerRow(f, created.memory)];
                }),
            }));
          } catch {
            set((state) => ({
              facts: state.facts.map((f) => (f.id === fact.id ? { ...f, unsaved: true } : f)),
            }));
          }
        }
      },
    }),
    {
      name: 'agi-memory-store-v1',
      partialize: (state) => ({ facts: state.facts.filter((f) => !f.pending) }),
    },
  ),
);

export const selectMemoryFacts = (s: MemoryState): MemoryFact[] => s.facts;
export const selectMemoryCount = (s: MemoryState): number => s.facts.length;
export const selectMemorySyncStatus = (s: MemoryState): MemorySyncStatus => s.syncStatus;

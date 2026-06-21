/**
 * Cloud sync sidecar state (P2 Phase 1).
 *
 * Tracks the delta-sync cursor (the server_version high-water mark) and the set of
 * locally-changed cloud rows still pending a push. This is a SIDECAR to
 * `chatCloudMessageStore` — it never holds chat content, only sync bookkeeping —
 * and is persisted under its own MMKV key so a cold start resumes mid-stream.
 *
 * Local-mode data is NEVER tracked here: the engine only marks rows dirty for
 * conversations that live in the cloud store, and only runs in managed mode.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

export type CloudSyncStatus = 'idle' | 'syncing' | 'error';

/** A message is addressed by (conversationId, messageId) — messages are stored per conversation. */
export interface DirtyMessageRef {
  conversationId: string;
  messageId: string;
}

interface CloudSyncState {
  /** Highest server_version applied from a pull (bigint as a string; '0' = never synced). */
  cursor: string;
  lastSyncAt: number | null;
  status: CloudSyncStatus;
  lastError: string | null;
  /** Cloud conversation ids with un-pushed local changes. */
  dirtyConversationIds: string[];
  /** Cloud messages with un-pushed local changes. */
  dirtyMessages: DirtyMessageRef[];

  setCursor: (cursor: string) => void;
  setStatus: (status: CloudSyncStatus, error?: string | null) => void;
  markConversationDirty: (id: string) => void;
  markMessageDirty: (conversationId: string, messageId: string) => void;
  clearDirty: (conversationIds: string[], messages: DirtyMessageRef[]) => void;
  /** Reset all sync bookkeeping (e.g. on sign-out / account switch). */
  reset: () => void;
}

export const useCloudSyncStateStore = create<CloudSyncState>()(
  persist(
    (set) => ({
      cursor: '0',
      lastSyncAt: null,
      status: 'idle',
      lastError: null,
      dirtyConversationIds: [],
      dirtyMessages: [],

      setCursor: (cursor) => set({ cursor }),
      setStatus: (status, error = null) =>
        set({ status, lastError: status === 'error' ? error : null }),
      markConversationDirty: (id) =>
        set((s) =>
          s.dirtyConversationIds.includes(id)
            ? s
            : { dirtyConversationIds: [...s.dirtyConversationIds, id] },
        ),
      markMessageDirty: (conversationId, messageId) =>
        set((s) =>
          s.dirtyMessages.some((m) => m.messageId === messageId)
            ? s
            : { dirtyMessages: [...s.dirtyMessages, { conversationId, messageId }] },
        ),
      clearDirty: (conversationIds, messages) =>
        set((s) => ({
          dirtyConversationIds: s.dirtyConversationIds.filter(
            (id) => !conversationIds.includes(id),
          ),
          dirtyMessages: s.dirtyMessages.filter(
            (m) => !messages.some((cm) => cm.messageId === m.messageId),
          ),
        })),
      reset: () =>
        set({
          cursor: '0',
          lastSyncAt: null,
          status: 'idle',
          lastError: null,
          dirtyConversationIds: [],
          dirtyMessages: [],
        }),
    }),
    {
      name: 'cloud-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      // Status is transient; only the cursor + dirty queue must survive a restart.
      partialize: (s) => ({
        cursor: s.cursor,
        lastSyncAt: s.lastSyncAt,
        dirtyConversationIds: s.dirtyConversationIds,
        dirtyMessages: s.dirtyMessages,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[cloudSyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useCloudSyncStateStore, 'cloud-sync-state');

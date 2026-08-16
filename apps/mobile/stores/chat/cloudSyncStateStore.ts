import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

export type CloudSyncStatus = 'idle' | 'syncing' | 'error';

export interface DirtyMessageRef {
  conversationId: string;
  messageId: string;
}

interface CloudSyncState {
  cursor: string;
  lastSyncAt: number | null;
  status: CloudSyncStatus;
  lastError: string | null;
  dirtyConversationIds: string[];
  dirtyMessages: DirtyMessageRef[];

  setCursor: (cursor: string) => void;
  setStatus: (status: CloudSyncStatus, error?: string | null) => void;
  markConversationDirty: (id: string) => void;
  markMessageDirty: (conversationId: string, messageId: string) => void;
  clearDirty: (conversationIds: string[], messages: DirtyMessageRef[]) => void;
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

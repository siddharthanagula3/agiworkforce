/**
 * Memory cloud sync sidecar state.
 *
 * Tracks the memory delta-sync cursor (a separate bigint-as-string high-water
 * mark, independent from the chat cursor in cloudSyncStateStore) and the set
 * of locally-changed cloud memory IDs pending a push.
 *
 * A separate store (rather than extending cloudSyncStateStore) keeps the blast
 * radius minimal: chat and memory cursors are independent sequences and must
 * advance independently.
 *
 * NEVER tracks local (SQLite) memory — only cloud-mode entries.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface MemorySyncState {
  /**
   * Highest `server_version` applied from a memory pull (bigint as a string).
   * '0' means never synced.
   */
  memoryCursor: string;
  /** Cloud memory IDs with un-pushed local changes (create/update/delete). */
  dirtyMemoryIds: string[];

  setMemoryCursor: (cursor: string) => void;
  markMemoryDirty: (id: string) => void;
  clearMemoryDirty: (ids: string[]) => void;
  /** Reset all memory sync bookkeeping (e.g. on sign-out / account switch). */
  resetMemorySync: () => void;
}

export const useMemorySyncStateStore = create<MemorySyncState>()(
  persist(
    (set) => ({
      memoryCursor: '0',
      dirtyMemoryIds: [],

      setMemoryCursor: (cursor) => set({ memoryCursor: cursor }),

      markMemoryDirty: (id) =>
        set((s) =>
          s.dirtyMemoryIds.includes(id) ? s : { dirtyMemoryIds: [...s.dirtyMemoryIds, id] },
        ),

      clearMemoryDirty: (ids) =>
        set((s) => ({ dirtyMemoryIds: s.dirtyMemoryIds.filter((id) => !ids.includes(id)) })),

      resetMemorySync: () =>
        set({
          memoryCursor: '0',
          dirtyMemoryIds: [],
        }),
    }),
    {
      name: 'memory-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (s) => ({
        memoryCursor: s.memoryCursor,
        dirtyMemoryIds: s.dirtyMemoryIds,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[memorySyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useMemorySyncStateStore, 'memory-sync-state');

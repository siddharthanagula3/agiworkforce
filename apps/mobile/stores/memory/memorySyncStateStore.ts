import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface MemorySyncState {
  memoryCursor: string;
  dirtyMemoryIds: string[];
  accountMemoryEnabled: boolean | null;

  setMemoryCursor: (cursor: string) => void;
  markMemoryDirty: (id: string) => void;
  clearMemoryDirty: (ids: string[]) => void;
  setAccountMemoryEnabled: (enabled: boolean) => void;
  resetMemorySync: () => void;
}

export const useMemorySyncStateStore = create<MemorySyncState>()(
  persist(
    (set) => ({
      memoryCursor: '0',
      dirtyMemoryIds: [],
      accountMemoryEnabled: null,

      setMemoryCursor: (cursor) => set({ memoryCursor: cursor }),

      markMemoryDirty: (id) =>
        set((s) =>
          s.dirtyMemoryIds.includes(id) ? s : { dirtyMemoryIds: [...s.dirtyMemoryIds, id] },
        ),

      clearMemoryDirty: (ids) =>
        set((s) => ({ dirtyMemoryIds: s.dirtyMemoryIds.filter((id) => !ids.includes(id)) })),

      setAccountMemoryEnabled: (enabled) => set({ accountMemoryEnabled: enabled }),

      resetMemorySync: () =>
        set({
          memoryCursor: '0',
          dirtyMemoryIds: [],
          accountMemoryEnabled: null,
        }),
    }),
    {
      name: 'memory-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (s) => ({
        memoryCursor: s.memoryCursor,
        dirtyMemoryIds: s.dirtyMemoryIds,
        accountMemoryEnabled: s.accountMemoryEnabled,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[memorySyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useMemorySyncStateStore, 'memory-sync-state');

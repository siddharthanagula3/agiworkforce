import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface ProjectSyncState {
  projectCursor: string;
  dirtyProjectIds: string[];
  projectOnlyMemoryPendingIds: string[];

  setProjectCursor: (cursor: string) => void;
  markProjectDirty: (id: string) => void;
  clearProjectDirty: (ids: string[]) => void;
  markProjectOnlyMemoryPending: (id: string) => void;
  clearProjectOnlyMemoryPending: (id: string) => void;
  resetProjectSync: () => void;
}

export const useProjectSyncStateStore = create<ProjectSyncState>()(
  persist(
    (set) => ({
      projectCursor: '0',
      dirtyProjectIds: [],
      projectOnlyMemoryPendingIds: [],

      setProjectCursor: (cursor) => set({ projectCursor: cursor }),

      markProjectDirty: (id) =>
        set((s) =>
          s.dirtyProjectIds.includes(id) ? s : { dirtyProjectIds: [...s.dirtyProjectIds, id] },
        ),

      clearProjectDirty: (ids) =>
        set((s) => ({ dirtyProjectIds: s.dirtyProjectIds.filter((id) => !ids.includes(id)) })),

      markProjectOnlyMemoryPending: (id) =>
        set((s) =>
          s.projectOnlyMemoryPendingIds.includes(id)
            ? s
            : { projectOnlyMemoryPendingIds: [...s.projectOnlyMemoryPendingIds, id] },
        ),

      clearProjectOnlyMemoryPending: (id) =>
        set((s) =>
          s.projectOnlyMemoryPendingIds.includes(id)
            ? {
                projectOnlyMemoryPendingIds: s.projectOnlyMemoryPendingIds.filter(
                  (pending) => pending !== id,
                ),
              }
            : s,
        ),

      resetProjectSync: () =>
        set({
          projectCursor: '0',
          dirtyProjectIds: [],
          projectOnlyMemoryPendingIds: [],
        }),
    }),
    {
      name: 'project-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (s) => ({
        projectCursor: s.projectCursor,
        dirtyProjectIds: s.dirtyProjectIds,
        projectOnlyMemoryPendingIds: s.projectOnlyMemoryPendingIds,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[projectSyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useProjectSyncStateStore, 'project-sync-state');

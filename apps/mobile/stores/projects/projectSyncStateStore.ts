import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface ProjectSyncState {
  projectCursor: string;
  dirtyProjectIds: string[];

  setProjectCursor: (cursor: string) => void;
  markProjectDirty: (id: string) => void;
  clearProjectDirty: (ids: string[]) => void;
  resetProjectSync: () => void;
}

export const useProjectSyncStateStore = create<ProjectSyncState>()(
  persist(
    (set) => ({
      projectCursor: '0',
      dirtyProjectIds: [],

      setProjectCursor: (cursor) => set({ projectCursor: cursor }),

      markProjectDirty: (id) =>
        set((s) =>
          s.dirtyProjectIds.includes(id) ? s : { dirtyProjectIds: [...s.dirtyProjectIds, id] },
        ),

      clearProjectDirty: (ids) =>
        set((s) => ({ dirtyProjectIds: s.dirtyProjectIds.filter((id) => !ids.includes(id)) })),

      resetProjectSync: () =>
        set({
          projectCursor: '0',
          dirtyProjectIds: [],
        }),
    }),
    {
      name: 'project-sync-state',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      partialize: (s) => ({
        projectCursor: s.projectCursor,
        dirtyProjectIds: s.dirtyProjectIds,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[projectSyncStateStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useProjectSyncStateStore, 'project-sync-state');

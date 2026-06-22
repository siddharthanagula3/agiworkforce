/**
 * Project cloud sync sidecar state.
 *
 * Tracks the projects delta-sync cursor (a separate bigint-as-string high-water
 * mark, independent from the chat cursor in cloudSyncStateStore AND the memory
 * cursor in memorySyncStateStore) and the set of locally-changed cloud project
 * IDs pending a push.
 *
 * A separate store (rather than extending either existing sync-state store) keeps
 * the blast radius minimal: chat, memory, and project cursors are independent
 * sequences and must advance independently.
 *
 * NEVER tracks local (MMKV project-store) projects — only cloud-mode entries.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

interface ProjectSyncState {
  /**
   * Highest `server_version` applied from a projects pull (bigint as a string).
   * '0' means never synced.
   */
  projectCursor: string;
  /** Cloud project IDs with un-pushed local changes (create/update/archive/delete). */
  dirtyProjectIds: string[];

  setProjectCursor: (cursor: string) => void;
  markProjectDirty: (id: string) => void;
  clearProjectDirty: (ids: string[]) => void;
  /** Reset all project sync bookkeeping (e.g. on sign-out / account switch). */
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

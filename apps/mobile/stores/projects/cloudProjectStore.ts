import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';

export interface CloudProject {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  source: 'mobile' | 'desktop' | 'web';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  serverVersion?: string;
}

interface CloudProjectState {
  projects: CloudProject[];

  activeProjectId: string | null;

  upsertCloudProject: (project: CloudProject) => void;
  hardDeleteCloudProject: (id: string) => void;
  applyCloudProjectDeltas: (deltas: CloudProject[]) => void;
  setActiveCloudProject: (id: string | null) => void;
  clearCloudProjectData: () => void;
}

export const useCloudProjectStore = create<CloudProjectState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,

      upsertCloudProject: (project) => {
        set((state) => {
          const idx = state.projects.findIndex((p) => p.id === project.id);
          const projects =
            idx === -1
              ? [...state.projects, project]
              : state.projects.map((p, i) => (i === idx ? project : p));
          const activeProjectId =
            project.deletedAt !== null && state.activeProjectId === project.id
              ? null
              : state.activeProjectId;
          return { projects, activeProjectId };
        });
      },

      hardDeleteCloudProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      applyCloudProjectDeltas: (deltas) => {
        set((state) => {
          const byId = new Map(state.projects.map((p) => [p.id, p]));
          let activeProjectId = state.activeProjectId;
          for (const delta of deltas) {
            if (delta.deletedAt !== null) {
              byId.delete(delta.id);
              if (activeProjectId === delta.id) activeProjectId = null;
            } else {
              byId.set(delta.id, delta);
            }
          }
          return { projects: Array.from(byId.values()), activeProjectId };
        });
      },

      setActiveCloudProject: (id) => {
        set((state) => {
          if (id === null) return { activeProjectId: null };
          const live = state.projects.some((p) => p.id === id && p.deletedAt === null);
          return live ? { activeProjectId: id } : state;
        });
      },

      clearCloudProjectData: () => {
        set({ projects: [], activeProjectId: null });
      },
    }),
    {
      name: 'projects-store-cloud',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[cloudProjectStore] Hydration failed:', error);
      },
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    },
  ),
);

rehydrateWhenMmkvReady(useCloudProjectStore, 'projects-store-cloud');

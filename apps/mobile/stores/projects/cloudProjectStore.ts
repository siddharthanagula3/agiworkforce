import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { bigintGreater } from '@agiworkforce/sync';
import type { ManagedCloudProject } from '@agiworkforce/cloud-contracts';
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

export type CloudProjectDetails = Pick<
  ManagedCloudProject,
  'iconEmoji' | 'accentColor' | 'defaultModelId' | 'conversationCount' | 'knowledgeFileCount'
>;

const pendingProjectFetches = new Map<string, { generation: number; count: number }>();

export function beginCloudProjectFetch(id: string): {
  isCurrent: () => boolean;
  release: () => void;
} {
  const entry = pendingProjectFetches.get(id) ?? { generation: 0, count: 0 };
  entry.count += 1;
  pendingProjectFetches.set(id, entry);
  const generation = entry.generation;
  return {
    isCurrent: () => pendingProjectFetches.get(id)?.generation === generation,
    release: () => {
      const current = pendingProjectFetches.get(id);
      if (current !== entry) return;
      current.count -= 1;
      if (current.count === 0) pendingProjectFetches.delete(id);
    },
  };
}

function invalidateProjectFetch(id: string): void {
  const entry = pendingProjectFetches.get(id);
  if (entry) entry.generation += 1;
}

interface CloudProjectState {
  projects: CloudProject[];

  activeProjectId: string | null;
  details: Record<string, CloudProjectDetails>;

  upsertCloudProject: (project: CloudProject) => void;
  hardDeleteCloudProject: (id: string) => void;
  applyCloudProjectDeltas: (deltas: CloudProject[]) => void;
  setActiveCloudProject: (id: string | null) => void;
  clearCloudProjectData: () => void;
  setCloudProjectDetails: (projects: readonly ManagedCloudProject[]) => void;
  patchCloudProjectDetails: (id: string, patch: Partial<CloudProjectDetails>) => void;
}

export const useCloudProjectStore = create<CloudProjectState>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      details: {},

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
        invalidateProjectFetch(id);
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
            const current = byId.get(delta.id);
            if (
              current?.serverVersion &&
              delta.serverVersion &&
              bigintGreater(current.serverVersion, delta.serverVersion)
            ) {
              continue;
            }
            if (delta.deletedAt !== null) {
              invalidateProjectFetch(delta.id);
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
        for (const entry of pendingProjectFetches.values()) entry.generation += 1;
        set({ projects: [], activeProjectId: null, details: {} });
      },

      setCloudProjectDetails: (projects) => {
        set((state) => {
          const details = { ...state.details };
          for (const project of projects) {
            details[project.id] = {
              iconEmoji: project.iconEmoji ?? null,
              accentColor: project.accentColor ?? null,
              defaultModelId: project.defaultModelId ?? null,
              conversationCount: project.conversationCount ?? null,
              knowledgeFileCount: project.knowledgeFileCount ?? null,
            };
          }
          return { details };
        });
      },

      patchCloudProjectDetails: (id, patch) => {
        set((state) => ({
          details: { ...state.details, [id]: { ...state.details[id], ...patch } },
        }));
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

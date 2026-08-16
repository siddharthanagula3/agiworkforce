import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { markProjectForSync } from '@/services/cloudSyncEngine';

export interface ProjectSource {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  uri: string;
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  sources?: ProjectSource[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;

  createProject: (name: string, description: string, instructions: string) => string;
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  addSource: (projectId: string, source: Omit<ProjectSource, 'id' | 'addedAt'>) => void;
  removeSource: (projectId: string, sourceId: string) => void;
}

function generateLocalId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name, description, instructions) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const id = uuidv7();
          const now = new Date().toISOString();
          useCloudProjectStore.getState().upsertCloudProject({
            id,
            name: name.trim(),
            description: description.trim() || null,
            instructions: instructions.trim() || null,
            color: null,
            isArchived: false,
            metadata: null,
            source: 'mobile',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            serverVersion: '0',
          });
          markProjectForSync(id);
          return id;
        }

        const id = generateLocalId();
        const now = new Date().toISOString();
        const project: Project = {
          id,
          name,
          description,
          instructions,
          sources: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          projects: [project, ...state.projects],
        }));
        return id;
      },

      updateProject: (id, updates) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const existing = useCloudProjectStore.getState().projects.find((p) => p.id === id);
          if (existing) {
            useCloudProjectStore.getState().upsertCloudProject({
              ...existing,
              name: updates.name !== undefined ? updates.name : existing.name,
              description:
                updates.description !== undefined
                  ? updates.description || null
                  : existing.description,
              instructions:
                updates.instructions !== undefined
                  ? updates.instructions || null
                  : existing.instructions,
              updatedAt: new Date().toISOString(),
            });
            markProjectForSync(id);
          }
          return;
        }

        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        }));
      },

      deleteProject: (id) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          const existing = useCloudProjectStore.getState().projects.find((p) => p.id === id);
          if (existing) {
            useCloudProjectStore.getState().upsertCloudProject({
              ...existing,
              deletedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            markProjectForSync(id);
          }
          return;
        }

        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      setActiveProject: (id) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
        if (id !== null) {
          if (isCloud) {
            const exists = useCloudProjectStore
              .getState()
              .projects.some((p) => p.id === id && p.deletedAt === null);
            if (!exists) return;
            useCloudProjectStore.getState().setActiveCloudProject(id);
            return;
          } else {
            const exists = get().projects.some((p) => p.id === id);
            if (!exists) return;
          }
        }
        if (isCloud) {
          useCloudProjectStore.getState().setActiveCloudProject(null);
        } else {
          set({ activeProjectId: id });
        }
      },

      addSource: (projectId, source) => {
        const sourceId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const addedAt = new Date().toISOString();
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  sources: [...(p.sources ?? []), { ...source, id: sourceId, addedAt }],
                  updatedAt: addedAt,
                }
              : p,
          ),
        }));
      },

      removeSource: (projectId, sourceId) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  sources: (p.sources ?? []).filter((s) => s.id !== sourceId),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },
    }),
    {
      name: 'project-store',
      storage: createJSONStorage(() => mmkvStorage),
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[projectStore] Hydration failed:', error);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useProjectStore, 'projectStore');

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { markProjectForSync } from '@/services/cloudSyncEngine';

/** A knowledge file attached to a project as context source. */
export interface ProjectSource {
  id: string;
  /** Original file name shown in the UI */
  name: string;
  /** MIME type returned by the document picker */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Local file URI from expo-document-picker / expo-file-system */
  uri: string;
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  /** Attached knowledge files. Optional for backward-compat with persisted
   *  projects that predate this field; always coerce via `?? []` at read sites. */
  sources?: ProjectSource[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  /** All user projects (LOCAL mode only — cloud projects live in cloudProjectStore). */
  projects: Project[];
  /** Currently active project ID (applies context to chat) */
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
          // ── Cloud path: write to cloud project store + queue for push ──────────
          // TRUST BOUNDARY: local MMKV project-store is NOT written. Cloud project
          // IDs are UUIDv7 (collision-free, time-ordered) as required by the server
          // contract (z.string().uuid() validation on push).
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
          });
          markProjectForSync(id);
          return id;
        }

        // ── Local path: write to persisted MMKV store ───────────────────────────
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
          // ── Cloud path ────────────────────────────────────────────────────────
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

        // ── Local path ────────────────────────────────────────────────────────
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        }));
      },

      deleteProject: (id) => {
        const isCloud = useChatAppModeStore.getState().appMode === 'cloud';

        if (isCloud) {
          // ── Cloud path: mark as tombstone, keep in cloud store until server acks ──
          // CRITICAL: must NOT hard-delete locally before the server receives the
          // tombstone, otherwise the delete is silently lost. The sync engine's
          // pushProjects() will hard-delete after receiving the server ack.
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

        // ── Local path ────────────────────────────────────────────────────────
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      setActiveProject: (id) => {
        // Validate that the project exists (or allow null to clear)
        if (id !== null) {
          const isCloud = useChatAppModeStore.getState().appMode === 'cloud';
          if (isCloud) {
            const exists = useCloudProjectStore
              .getState()
              .projects.some((p) => p.id === id && p.deletedAt === null);
            if (!exists) return;
          } else {
            const exists = get().projects.some((p) => p.id === id);
            if (!exists) return;
          }
        }
        set({ activeProjectId: id });
      },

      addSource: (projectId, source) => {
        // Sources are local-only (knowledge-file bytes excluded from cloud sync
        // per the web contract). No cloud branch needed.
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
      // AUDIT-FIX: MMKV-RACE
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[projectStore] Hydration failed:', error);
      },
    },
  ),
);

// FIX (audit 2026-05-20, §17): use the shared rehydrate helper.
rehydrateWhenMmkvReady(useProjectStore, 'projectStore');

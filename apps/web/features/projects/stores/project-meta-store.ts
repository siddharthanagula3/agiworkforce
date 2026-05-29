/**
 * Project Meta Store — web-surface local metadata keyed by project id.
 *
 * Stores per-project preferences that are not part of the canonical
 * `@agiworkforce/unified-chat` `Project` shape: the selected model id
 * for each project. Persisted to localStorage under `agi-project-meta-web`.
 *
 * v1 LOCAL-ONLY: device-local only. Cloud Managed sync is waitlist-gated.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ProjectMeta {
  /** Model id selected for this project (mirrors useModelStore.selectedModelId). */
  selectedModelId?: string;
}

interface ProjectMetaState {
  /** Keyed by project id. */
  meta: Record<string, ProjectMeta>;
  /** Set the model id for a project. */
  setProjectModel: (projectId: string, modelId: string) => void;
  /** Get the model id for a project, or undefined if not set. */
  getProjectModel: (projectId: string) => string | undefined;
}

export const useProjectMetaStore = create<ProjectMetaState>()(
  persist(
    (set, get) => ({
      meta: {},

      setProjectModel: (projectId, modelId) =>
        set((state) => ({
          meta: {
            ...state.meta,
            [projectId]: { ...state.meta[projectId], selectedModelId: modelId },
          },
        })),

      getProjectModel: (projectId) => get().meta[projectId]?.selectedModelId,
    }),
    {
      name: 'agi-project-meta-web',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return localStorage;
      }),
    },
  ),
);

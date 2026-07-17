/**
 * Project Meta Store · web-surface local metadata keyed by project id.
 *
 * Stores ephemeral per-project preferences that are not yet returned by the
 * canonical managed-cloud project contract. Web is Cloud-only, so an
 * unscoped localStorage key must not retain one account's metadata for the
 * next account. Durable defaults belong in the project API.
 */

import { create } from 'zustand';

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

export const useProjectMetaStore = create<ProjectMetaState>()((set, get) => ({
  meta: {},

  setProjectModel: (projectId, modelId) =>
    set((state) => ({
      meta: {
        ...state.meta,
        [projectId]: { ...state.meta[projectId], selectedModelId: modelId },
      },
    })),

  getProjectModel: (projectId) => get().meta[projectId]?.selectedModelId,
}));

export function resetProjectMetaStore(): void {
  useProjectMetaStore.setState({ meta: {} });
}

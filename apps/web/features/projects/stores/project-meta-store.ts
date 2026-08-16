
import { create } from 'zustand';

interface ProjectMeta {
  selectedModelId?: string;
}

interface ProjectMetaState {
  meta: Record<string, ProjectMeta>;
  setProjectModel: (projectId: string, modelId: string) => void;
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

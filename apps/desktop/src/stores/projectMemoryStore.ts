import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';

export interface ProjectMemory {
  id: number;
  project_folder: string;
  memory_type: string;
  content: string;
  importance: number;
  created_at: string;
  updated_at: string;
  last_accessed: string | null;
}

interface ProjectMemoryState {
  projectFolder: string | null;
  memories: ProjectMemory[];
  isLoading: boolean;
  error: string | null;

  loadProjectMemories: (projectFolder: string) => Promise<void>;
  addProjectMemory: (projectFolder: string, decision: string, rationale: string) => Promise<void>;
  deleteProjectMemory: (memoryId: number) => Promise<void>;
  reset: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useProjectMemoryStore = create<ProjectMemoryState>()(
  devtools(
    (set, get) => ({
      projectFolder: null,
      memories: [],
      isLoading: false,
      error: null,

      loadProjectMemories: async (projectFolder) => {
        const folderChanged = get().projectFolder !== projectFolder;
        set(
          {
            projectFolder,
            isLoading: true,
            error: null,
            ...(folderChanged ? { memories: [] } : {}),
          },
          undefined,
          'projectMemory/load/start',
        );
        try {
          const memories = await invoke<ProjectMemory[]>('get_project_memories', {
            projectFolder,
          });
          if (get().projectFolder !== projectFolder) return;
          set({ memories, isLoading: false }, undefined, 'projectMemory/load/success');
        } catch (error) {
          if (get().projectFolder !== projectFolder) return;
          set(
            { error: errorMessage(error), isLoading: false },
            undefined,
            'projectMemory/load/error',
          );
        }
      },

      addProjectMemory: async (projectFolder, decision, rationale) => {
        await invoke<number>('save_architectural_decision', {
          request: { projectFolder, decision, rationale },
        });
        await get().loadProjectMemories(projectFolder);
      },

      deleteProjectMemory: async (memoryId) => {
        await invoke<boolean>('delete_project_memory', { memoryId });
        set(
          (state) => ({ memories: state.memories.filter((memory) => memory.id !== memoryId) }),
          undefined,
          'projectMemory/delete/success',
        );
      },

      reset: () => {
        set(
          { projectFolder: null, memories: [], isLoading: false, error: null },
          undefined,
          'projectMemory/reset',
        );
      },
    }),
    { name: 'ProjectMemoryStore', enabled: import.meta.env.DEV },
  ),
);

// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
import { toast } from 'sonner';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';

export interface ProjectContext {
  id: number;
  project_folder: string;
  tech_stack: string[];
  main_language: string | null;
  conventions: string | null;
  frameworks: string[];
  importance: number;
  created_at: string;
  updated_at: string;
}

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

export interface SaveProjectContextRequest {
  projectFolder: string;
  techStack: string[];
  mainLanguage?: string;
  conventions?: string;
  frameworks: string[];
  importance?: number;
}

export interface SearchMemoriesRequest {
  projectFolder: string;
  query: string;
  limit?: number;
}

interface ProjectMemoryState {
  isLoading: boolean;
  error: string | null;

  saveProjectContext: (request: SaveProjectContextRequest) => Promise<number>;
  getProjectMemories: (projectFolder: string) => Promise<ProjectMemory[]>;
  searchProjectMemories: (request: SearchMemoriesRequest) => Promise<ProjectMemory[]>;
  clearError: () => void;
}

export const useProjectMemoryStore = create<ProjectMemoryState>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

      saveProjectContext: async (request: SaveProjectContextRequest) => {
        set({ isLoading: true, error: null }, undefined, 'projectMemory/saveContext/start');
        try {
          const id = await invoke<number>('save_project_context', {
            request: {
              projectFolder: request.projectFolder,
              techStack: request.techStack,
              mainLanguage: request.mainLanguage ?? null,
              conventions: request.conventions ?? null,
              frameworks: request.frameworks,
              importance: request.importance ?? null,
            },
          });
          set({ isLoading: false }, undefined, 'projectMemory/saveContext/success');
          toast.success('Project context saved');
          return id;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[projectMemoryStore] failed to save project context:', msg);
          set({ error: msg, isLoading: false }, undefined, 'projectMemory/saveContext/error');
          toast.error(`Failed to save project context: ${msg}`);
          throw error;
        }
      },

      getProjectMemories: async (projectFolder: string) => {
        set({ isLoading: true, error: null }, undefined, 'projectMemory/getMemories/start');
        try {
          const memories = await invoke<ProjectMemory[]>('get_project_memories', {
            projectFolder,
          });
          set({ isLoading: false }, undefined, 'projectMemory/getMemories/success');
          return memories;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[projectMemoryStore] failed to get memories:', msg);
          set({ error: msg, isLoading: false }, undefined, 'projectMemory/getMemories/error');
          throw error;
        }
      },

      searchProjectMemories: async (request: SearchMemoriesRequest) => {
        set({ isLoading: true, error: null }, undefined, 'projectMemory/search/start');
        try {
          const results = await invoke<ProjectMemory[]>('search_project_memories', {
            request: {
              projectFolder: request.projectFolder,
              query: request.query,
              limit: request.limit ?? null,
            },
          });
          set({ isLoading: false }, undefined, 'projectMemory/search/success');
          return results;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('[projectMemoryStore] failed to search memories:', msg);
          set({ error: msg, isLoading: false }, undefined, 'projectMemory/search/error');
          throw error;
        }
      },

      clearError: () => {
        set({ error: null }, undefined, 'projectMemory/clearError');
      },
    }),
    { name: 'ProjectMemoryStore', enabled: import.meta.env.DEV },
  ),
);

export const selectProjectMemoryLoading = (state: ProjectMemoryState) => state.isLoading;
export const selectProjectMemoryError = (state: ProjectMemoryState) => state.error;

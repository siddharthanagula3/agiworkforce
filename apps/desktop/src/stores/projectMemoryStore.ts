// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
/**
 * Project Memory Store
 *
 * Manages project-scoped long-term memory: project context, coding styles,
 * architectural decisions, and semantic search across project memories.
 * Backed by SQLite via Tauri commands (project_memory module).
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { invoke } from '../lib/tauri-mock';

// ---------------------------------------------------------------------------
// Types (mirror Rust structs from project_memory.rs)
// ---------------------------------------------------------------------------

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

/** Request payload for save_project_context */
export interface SaveProjectContextRequest {
  projectFolder: string;
  techStack: string[];
  mainLanguage?: string;
  conventions?: string;
  frameworks: string[];
  importance?: number;
}

/** Request payload for search_project_memories */
export interface SearchMemoriesRequest {
  projectFolder: string;
  query: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ProjectMemoryState {
  isLoading: boolean;
  error: string | null;

  // Actions
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
          // Tauri expects the Rust struct as a single `request` object param.
          // The Rust side uses SaveProjectContextRequest with snake_case fields,
          // but Tauri auto-converts camelCase -> snake_case for struct fields too.
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

// Selectors
export const selectProjectMemoryLoading = (state: ProjectMemoryState) => state.isLoading;
export const selectProjectMemoryError = (state: ProjectMemoryState) => state.error;

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  /** All user projects */
  projects: Project[];
  /** Currently active project ID (applies context to chat) */
  activeProjectId: string | null;

  createProject: (name: string, description: string, instructions: string) => string;
  updateProject: (id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
}

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (name, description, instructions) => {
        const id = generateId();
        const now = new Date().toISOString();
        const project: Project = {
          id,
          name,
          description,
          instructions,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          projects: [project, ...state.projects],
        }));
        return id;
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      setActiveProject: (id) => {
        // Validate that the project exists (or allow null to clear)
        if (id !== null) {
          const exists = get().projects.some((p) => p.id === id);
          if (!exists) return;
        }
        set({ activeProjectId: id });
      },
    }),
    {
      name: 'project-store',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[projectStore] Hydration failed:', error);
      },
    },
  ),
);

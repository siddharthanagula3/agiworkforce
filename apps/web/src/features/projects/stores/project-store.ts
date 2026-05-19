/**
 * Project Store
 *
 * Zustand store for managing projects. Projects group conversations with shared
 * context and custom instructions — similar to claude.ai Projects.
 *
 * Each project has: id, name, description, instructions, color, createdAt, updatedAt.
 * When a project is active, its `instructions` are prepended to the system prompt.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  color: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateProjectInput {
  name: string;
  description: string;
  instructions: string;
  color: string;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
}

interface ProjectActions {
  setProjects: (projects: Project[]) => void;
  setActiveProject: (id: string | null) => void;
  /** Creates a project, returns the new project's id. */
  createProject: (input: CreateProjectInput) => string;
  updateProject: (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'color'>>,
  ) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  getActiveProjectInstructions: () => string;
}

export const useProjectStore = create<ProjectState & ProjectActions>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      setProjects: (projects) => set({ projects }),

      setActiveProject: (id) => set({ activeProjectId: id }),

      createProject: (input) => {
        const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const project: Project = {
          id,
          name: input.name,
          description: input.description,
          instructions: input.instructions,
          color: input.color,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ projects: [...s.projects, project] }));
        return id;
      },

      updateProject: (id, updates) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        })),

      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p,
          ),
        })),

      deleteProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
        })),

      getActiveProjectInstructions: () => {
        const { projects, activeProjectId } = get();
        if (!activeProjectId) return '';
        return projects.find((p) => p.id === activeProjectId)?.instructions ?? '';
      },
    }),
    {
      name: 'agi-projects',
      version: 1,
    },
  ),
);

/**
 * Static accessor for use outside React components (e.g., in service functions).
 * Returns the instructions for the currently active project.
 */
export function getActiveProjectInstructions(): string {
  return useProjectStore.getState().getActiveProjectInstructions();
}

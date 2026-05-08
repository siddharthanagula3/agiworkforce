import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Project } from '../lib/types';

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;

  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => Project | undefined;
  toggleStar: (id: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  immer((set, get) => ({
    projects: [],
    activeProjectId: null,

    setProjects: (projects) => set({ projects }),

    addProject: (project) =>
      set((state) => {
        state.projects.push(project);
      }),

    updateProject: (id, updates) =>
      set((state) => {
        const idx = state.projects.findIndex((p) => p.id === id);
        if (idx !== -1) {
          Object.assign(state.projects[idx]!, updates);
        }
      }),

    removeProject: (id) =>
      set((state) => {
        state.projects = state.projects.filter((p) => p.id !== id);
        if (state.activeProjectId === id) {
          state.activeProjectId = null;
        }
      }),

    setActiveProject: (id) => set({ activeProjectId: id }),

    getActiveProject: () => {
      const { projects, activeProjectId } = get();
      return projects.find((p) => p.id === activeProjectId);
    },

    toggleStar: (id) =>
      set((state) => {
        const idx = state.projects.findIndex((p) => p.id === id);
        if (idx !== -1) {
          state.projects[idx]!.starred = !state.projects[idx]!.starred;
        }
      }),
  })),
);

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
  reassignConversation: (
    conversationId: string,
    previousProjectId: string | null | undefined,
    nextProjectId: string | null | undefined,
  ) => void;
  createProject: (input: {
    name: string;
    description?: string;
    instructions?: string;
    color?: string;
    iconEmoji?: string;
    accentColor?: string;
  }) => string;
  getActiveProjectInstructions: () => string;
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
          Object.assign(state.projects[idx]!, {
            ...updates,
            updatedAt: new Date().toISOString(),
          });
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

    reassignConversation: (conversationId, previousProjectId, nextProjectId) =>
      set((state) => {
        const nextProject = nextProjectId
          ? state.projects.find((project) => project.id === nextProjectId)
          : undefined;
        if (nextProject?.conversationIds?.includes(conversationId)) return;

        if (previousProjectId) {
          const previousProject = state.projects.find(
            (project) => project.id === previousProjectId,
          );
          if (previousProject) {
            previousProject.conversationIds = (previousProject.conversationIds ?? []).filter(
              (id) => id !== conversationId,
            );
            previousProject.conversationCount = Math.max(
              0,
              (previousProject.conversationCount ?? previousProject.conversationIds.length + 1) - 1,
            );
          }
        }

        if (nextProject) {
          nextProject.conversationIds = [
            ...(nextProject.conversationIds ?? []).filter((id) => id !== conversationId),
            conversationId,
          ];
          nextProject.conversationCount =
            (nextProject.conversationCount ?? nextProject.conversationIds.length - 1) + 1;
        }
      }),

    createProject: (input) => {
      const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const project: Project = {
        id,
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        iconEmoji: input.iconEmoji,
        accentColor: input.accentColor,
        createdAt: now,
        updatedAt: now,
      };
      set((state) => {
        state.projects.push(project);
      });
      return id;
    },

    getActiveProjectInstructions: () => {
      const { projects, activeProjectId } = get();
      if (!activeProjectId) return '';
      return projects.find((p) => p.id === activeProjectId)?.instructions ?? '';
    },
  })),
);

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Project } from '../lib/types';

/**
 * Canonical in-memory project view model for surfaces that import
 * `@agiworkforce/unified-chat`.
 *
 * Persistence is intentionally owned by each application trust boundary.
 * The shared package cannot safely choose an unscoped browser key because
 * Web projects are account-owned managed-cloud records while Local projects
 * belong only to their device. Hosts hydrate this view model from their own
 * authenticated or local persistence adapter.
 *
 * Schema: `packages/ui/unified-chat/src/lib/types.ts#Project` — a superset of
 * the web-only schema (adds `iconEmoji`, `accentColor`, `starred`,
 * `conversationIds`). All extra fields are optional so existing persisted
 * records continue to deserialise without migration.
 */

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
  /**
   * Create a project from a minimal input and return its id. Mirrors the
   * web `project-store.ts` createProject API so callers can be migrated
   * incrementally.
   */
  createProject: (input: {
    name: string;
    description?: string;
    instructions?: string;
    color?: string;
    iconEmoji?: string;
    accentColor?: string;
  }) => string;
  /** Return the instructions for the active project, or empty string. */
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

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Project } from '../lib/types';

/**
 * Canonical project store — shared across all surfaces that import
 * `@agiworkforce/unified-chat`.
 *
 * Persisted to localStorage under `agi-projects` so that the web surface's
 * `features/projects/stores/project-store.ts` (which re-exports this store)
 * and the shared `ProjectGallery` / `ProjectCard` components all read and
 * write the same data.
 *
 * Schema: `packages/unified-chat/src/lib/types.ts#Project` — a superset of
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
  persist(
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
    {
      name: 'agi-projects',
      version: 1,
      storage: createJSONStorage(() => {
        // SSR-safe: fall back to a no-op when localStorage is not available
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return localStorage;
      }),
    },
  ),
);

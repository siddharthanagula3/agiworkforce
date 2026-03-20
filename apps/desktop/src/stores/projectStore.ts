/**
 * Project Store
 *
 * Manages project organization for the AGI Workforce desktop app.
 * Projects group conversations, files, and custom instructions together.
 * Also manages the current working folder for scoped sessions (like Claude Code).
 *
 * Updated to Zustand v5 best practices:
 * - Middleware composition: devtools(persist(subscribeWithSelector(...)))
 * - TypeScript: Using create<State>()() pattern for type inference
 * - Persist middleware: Using createJSONStorage, partialize, version, migrate
 * - Better devtools integration with store name
 * - subscribeWithSelector for granular subscriptions
 */
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { invoke, isTauri } from '../lib/tauri-mock';
import { storageFallback } from '../lib/storageFallback';

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mimeType?: string;
  addedAt: string;
}

export interface KnowledgeBaseFile {
  id: string;
  name: string;
  path: string;
  size?: number;
  mimeType?: string;
  /** The extracted text content of the file, stored for context injection */
  content?: string;
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  customInstructions: string;
  files: ProjectFile[];
  conversationIds: string[];
  color?: string;
  icon?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Preferred model ID for conversations in this project */
  preferredModel?: string;
  /** Knowledge base files with extracted content for context injection */
  knowledgeBaseFiles?: KnowledgeBaseFile[];
}

export interface ProjectSettings {
  defaultModel?: string;
  defaultProvider?: string;
  contextWindowSize?: number;
  autoArchiveAfterDays?: number;
  autoSaveMemories?: boolean;
}

/** Mirrors the Rust ProjectContext struct (camelCase via serde rename_all) */
export interface ProjectContext {
  folder: string | null;
  name: string | null;
  isValid: boolean;
}

/** Mirrors the Rust ProjectFileInfo struct (camelCase via serde rename_all) */
export interface ProjectFileInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  extension: string | null;
}

/** Mirrors the Rust ProjectInstructionFile struct (camelCase via serde rename_all) */
export interface ProjectInstructionFile {
  path: string;
  filename: string;
  content: string;
  scope: string;
}

interface ProjectState {
  // Data
  projects: Project[];
  activeProjectId: string | null;
  projectSettings: Record<string, ProjectSettings>;
  isLoading: boolean;
  error: string | null;

  // Folder scope (like Claude Code's project folder)
  currentFolder: string | null;
  recentFolders: string[];

  // Actions - CRUD
  loadProjects: () => Promise<void>;
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  unarchiveProject: (id: string) => Promise<void>;

  // Active project
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => Project | null;

  // File management
  addFileToProject: (projectId: string, file: Omit<ProjectFile, 'id' | 'addedAt'>) => Promise<void>;
  removeFileFromProject: (projectId: string, fileId: string) => Promise<void>;

  // Knowledge base management
  addKnowledgeBaseFile: (
    projectId: string,
    file: Omit<KnowledgeBaseFile, 'id' | 'addedAt'>,
  ) => Promise<void>;
  removeKnowledgeBaseFile: (projectId: string, fileId: string) => Promise<void>;

  // Conversation linking
  linkConversation: (projectId: string, conversationId: string) => Promise<void>;
  unlinkConversation: (projectId: string, conversationId: string) => Promise<void>;
  getProjectForConversation: (conversationId: string) => Project | null;

  // Project settings
  getProjectSettings: (projectId: string) => ProjectSettings;
  updateProjectSettings: (projectId: string, settings: Partial<ProjectSettings>) => Promise<void>;

  // Search/filter
  searchProjects: (query: string) => Project[];
  getArchivedProjects: () => Project[];
  getActiveProjects: () => Project[];

  // Folder scope actions
  setCurrentFolder: (path: string | null) => void;
  addRecentFolder: (path: string) => void;
  removeRecentFolder: (path: string) => void;
  clearRecentFolders: () => void;
  getCurrentFolderDisplayName: () => string | null;

  // Project context (Rust backend)
  getProjectContext: () => Promise<ProjectContext>;
  getProjectSummary: () => Promise<string>;
  listProjectFiles: (maxDepth?: number, includeHidden?: boolean) => Promise<ProjectFileInfo[]>;
  validateProjectPath: (path: string) => Promise<boolean>;
  loadProjectInstructions: () => Promise<ProjectInstructionFile[]>;
  hasProjectInstructions: () => Promise<boolean>;

  // Utilities
  clearError: () => void;
}

// Version for storage migration
const PROJECT_STORE_VERSION = 1;

// Maximum number of recent folders to keep
const MAX_RECENT_FOLDERS = 10;

/**
 * Formats a folder path for display (e.g., ~/Projects/my-app)
 */
function formatFolderPath(path: string): string {
  // If on Windows, try to shorten common paths
  if (path.includes('\\Users\\')) {
    const match = path.match(/[A-Z]:\\Users\\[^\\]+\\(.+)/i);
    if (match) {
      return '~\\' + match[1];
    }
  }

  // For Unix-like paths, try /home/user or /Users/user
  const unixMatch = path.match(/^\/(?:home|Users)\/[^/]+\/(.+)/);
  if (unixMatch) {
    return '~/' + unixMatch[1];
  }

  return path;
}

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      subscribeWithSelector((set, get) => ({
        // Initial state
        projects: [],
        activeProjectId: null,
        projectSettings: {},
        isLoading: false,
        error: null,

        // Folder scope state
        currentFolder: null,
        recentFolders: [],

        // Load projects from backend
        loadProjects: async () => {
          set({ isLoading: true, error: null });
          try {
            if (isTauri) {
              const projects = await invoke<Project[]>('project_list');
              set({ projects, isLoading: false });
            } else {
              // In web mode, projects are loaded from persisted state
              set({ isLoading: false });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to load projects:', errorMessage);
            set({ error: errorMessage, isLoading: false });
          }
        },

        // Create a new project
        createProject: async (projectData) => {
          set({ isLoading: true, error: null });
          try {
            const now = new Date().toISOString();
            const newProject: Project = {
              ...projectData,
              id: crypto.randomUUID(),
              createdAt: now,
              updatedAt: now,
            };

            if (isTauri) {
              const createdProject = await invoke<Project>('project_create', {
                project: newProject,
              });
              set((state) => ({
                projects: [...state.projects, createdProject],
                isLoading: false,
              }));
              return createdProject;
            } else {
              // Web mode - just add to local state
              set((state) => ({
                projects: [...state.projects, newProject],
                isLoading: false,
              }));
              return newProject;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to create project:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        },

        // Update an existing project
        updateProject: async (id, updates) => {
          set({ isLoading: true, error: null });
          try {
            const updatedAt = new Date().toISOString();
            const projectUpdates = { ...updates, updatedAt };

            if (isTauri) {
              await invoke('project_update', { id, updates: projectUpdates });
            }

            set((state) => ({
              projects: state.projects.map((p) => (p.id === id ? { ...p, ...projectUpdates } : p)),
              isLoading: false,
            }));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to update project:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        },

        // Delete a project
        deleteProject: async (id) => {
          set({ isLoading: true, error: null });
          try {
            if (isTauri) {
              await invoke('project_delete', { id });
            }

            set((state) => ({
              projects: state.projects.filter((p) => p.id !== id),
              activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
              isLoading: false,
            }));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to delete project:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        },

        // Archive a project
        archiveProject: async (id) => {
          await get().updateProject(id, { isArchived: true });
        },

        // Unarchive a project
        unarchiveProject: async (id) => {
          await get().updateProject(id, { isArchived: false });
        },

        // Set active project
        setActiveProject: (id) => {
          set({ activeProjectId: id });
        },

        // Get active project
        getActiveProject: () => {
          const { projects, activeProjectId } = get();
          if (!activeProjectId) return null;
          return projects.find((p) => p.id === activeProjectId) || null;
        },

        // Add file to project
        addFileToProject: async (projectId, fileData) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const newFile: ProjectFile = {
            ...fileData,
            id: crypto.randomUUID(),
            addedAt: new Date().toISOString(),
          };

          const updatedFiles = [...project.files, newFile];
          await get().updateProject(projectId, { files: updatedFiles });
        },

        // Remove file from project
        removeFileFromProject: async (projectId, fileId) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const updatedFiles = project.files.filter((f) => f.id !== fileId);
          await get().updateProject(projectId, { files: updatedFiles });
        },

        // Add a knowledge base file (with extracted content)
        addKnowledgeBaseFile: async (projectId, fileData) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const newFile: KnowledgeBaseFile = {
            ...fileData,
            id: crypto.randomUUID(),
            addedAt: new Date().toISOString(),
          };

          const updatedFiles = [...(project.knowledgeBaseFiles ?? []), newFile];
          await get().updateProject(projectId, { knowledgeBaseFiles: updatedFiles });
        },

        // Remove a knowledge base file
        removeKnowledgeBaseFile: async (projectId, fileId) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const updatedFiles = (project.knowledgeBaseFiles ?? []).filter((f) => f.id !== fileId);
          await get().updateProject(projectId, { knowledgeBaseFiles: updatedFiles });
        },

        // Link conversation to project
        linkConversation: async (projectId, conversationId) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          if (!project.conversationIds.includes(conversationId)) {
            const updatedConversationIds = [...project.conversationIds, conversationId];
            await get().updateProject(projectId, { conversationIds: updatedConversationIds });
          }
        },

        // Unlink conversation from project
        unlinkConversation: async (projectId, conversationId) => {
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const updatedConversationIds = project.conversationIds.filter(
            (id) => id !== conversationId,
          );
          await get().updateProject(projectId, { conversationIds: updatedConversationIds });
        },

        // Get project for a conversation
        getProjectForConversation: (conversationId) => {
          const { projects } = get();
          return projects.find((p) => p.conversationIds.includes(conversationId)) || null;
        },

        // Get project settings
        getProjectSettings: (projectId) => {
          return get().projectSettings[projectId] || {};
        },

        // Update project settings
        updateProjectSettings: async (projectId, settings) => {
          const currentSettings = get().projectSettings[projectId] || {};
          const updatedSettings = { ...currentSettings, ...settings };

          set((state) => ({
            projectSettings: {
              ...state.projectSettings,
              [projectId]: updatedSettings,
            },
          }));

          // Persist to backend if in Tauri
          if (isTauri) {
            try {
              await invoke('project_update_settings', {
                projectId,
                settings: updatedSettings,
              });
            } catch (error) {
              console.error('[ProjectStore] Failed to persist project settings:', error);
            }
          }
        },

        // Search projects
        searchProjects: (query) => {
          const { projects } = get();
          const lowerQuery = query.toLowerCase();
          return projects.filter(
            (p) =>
              p.name.toLowerCase().includes(lowerQuery) ||
              p.description.toLowerCase().includes(lowerQuery),
          );
        },

        // Get archived projects
        getArchivedProjects: () => {
          return get().projects.filter((p) => p.isArchived);
        },

        // Get active (non-archived) projects
        getActiveProjects: () => {
          return get().projects.filter((p) => !p.isArchived);
        },

        // Set current folder scope
        setCurrentFolder: (path) => {
          set({ currentFolder: path }, undefined, 'project/setCurrentFolder');

          // If setting a folder (not clearing), add to recent folders
          if (path) {
            const recent = get().recentFolders.filter((f) => f !== path);
            set(
              { recentFolders: [path, ...recent].slice(0, MAX_RECENT_FOLDERS) },
              undefined,
              'project/updateRecentFolders',
            );
          }
        },

        // Add a folder to recent folders list
        addRecentFolder: (path) => {
          const recent = get().recentFolders.filter((f) => f !== path);
          set(
            { recentFolders: [path, ...recent].slice(0, MAX_RECENT_FOLDERS) },
            undefined,
            'project/addRecentFolder',
          );
        },

        // Remove a folder from recent folders
        removeRecentFolder: (path) => {
          set(
            (state) => ({
              recentFolders: state.recentFolders.filter((f) => f !== path),
            }),
            undefined,
            'project/removeRecentFolder',
          );
        },

        // Clear all recent folders
        clearRecentFolders: () => {
          set({ recentFolders: [] }, undefined, 'project/clearRecentFolders');
        },

        // Get display-friendly name for current folder
        getCurrentFolderDisplayName: () => {
          const { currentFolder } = get();
          if (!currentFolder) return null;
          return formatFolderPath(currentFolder);
        },

        // Project context — Rust backend commands
        getProjectContext: async () => {
          try {
            return await invoke<ProjectContext>('project_context_get_folder');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to get project context:', errorMessage);
            set({ error: errorMessage });
            throw error;
          }
        },

        getProjectSummary: async () => {
          try {
            return await invoke<string>('project_context_get_summary');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to get project summary:', errorMessage);
            set({ error: errorMessage });
            throw error;
          }
        },

        listProjectFiles: async (maxDepth?: number, includeHidden?: boolean) => {
          try {
            return await invoke<ProjectFileInfo[]>('project_context_list_files', {
              maxDepth: maxDepth ?? null,
              includeHidden: includeHidden ?? null,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to list project files:', errorMessage);
            set({ error: errorMessage });
            throw error;
          }
        },

        validateProjectPath: async (path: string) => {
          try {
            return await invoke<boolean>('project_context_validate_path', { path });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to validate project path:', errorMessage);
            set({ error: errorMessage });
            throw error;
          }
        },

        loadProjectInstructions: async () => {
          try {
            return await invoke<ProjectInstructionFile[]>('project_load_instructions');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to load project instructions:', errorMessage);
            set({ error: errorMessage });
            throw error;
          }
        },

        hasProjectInstructions: async () => {
          try {
            return await invoke<boolean>('project_has_instructions');
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to check project instructions:', errorMessage);
            set({ error: errorMessage });
            throw error;
          }
        },

        // Clear error
        clearError: () => {
          set({ error: null });
        },
      })),
      {
        name: 'project-store',
        version: PROJECT_STORE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          projects: state.projects,
          activeProjectId: state.activeProjectId,
          projectSettings: state.projectSettings,
          currentFolder: state.currentFolder,
          recentFolders: state.recentFolders,
        }),
        migrate: (state) => state as ProjectState,
      },
    ),
    { name: 'ProjectStore', enabled: import.meta.env.DEV },
  ),
);

// Selectors
export const selectActiveProject = (state: ProjectState) => {
  if (!state.activeProjectId) return null;
  return state.projects.find((p) => p.id === state.activeProjectId) || null;
};

export const selectActiveProjects = (state: ProjectState) =>
  state.projects.filter((p) => !p.isArchived);

export const selectArchivedProjects = (state: ProjectState) =>
  state.projects.filter((p) => p.isArchived);

export const selectProjectById = (id: string) => (state: ProjectState) =>
  state.projects.find((p) => p.id === id) || null;

// Folder scope selectors
export const selectCurrentFolder = (state: ProjectState) => state.currentFolder;
export const selectRecentFolders = (state: ProjectState) => state.recentFolders;
export const selectHasCurrentFolder = (state: ProjectState) => state.currentFolder !== null;

// Export the formatFolderPath utility for use in components
export { formatFolderPath };

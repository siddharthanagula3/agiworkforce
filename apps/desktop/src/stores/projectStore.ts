// TODO(task-1.3): migrate to packages/client/client-runtime/state (see AppStateStore.ts domain mapping)
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
import type { ProjectAccentColor, PrivacyMode } from '@agiworkforce/types';
import { useAppModeStore } from './appModeStore';
import { desktopCloudProjects } from '../services/desktopCloudProjects';
import { updateCloudConversation } from '../services/cloudChat';
import { useChatStore } from './chat/chatStore';
import { selectHasCloudAccountSession, useAuthStore } from './auth';

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
  /** Canonical server count when exact conversation ids have not hydrated yet. */
  conversationCount?: number | null;
  color?: string;
  icon?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  /** Knowledge base files with extracted content for context injection */
  knowledgeBaseFiles?: KnowledgeBaseFile[];
  /** Single grapheme emoji displayed as the project icon in UI */
  iconEmoji?: string | null;
  /** Canonical accent color from the design system palette */
  accentColor?: ProjectAccentColor | null;
  /** Default privacy mode for new conversations in this project */
  defaultPrivacyMode?: PrivacyMode | null;
}

export interface ProjectSettings {
  defaultModel?: string;
  defaultProvider?: string;
  contextWindowSize?: number;
  autoArchiveAfterDays?: number;
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
  loadProjects: (options?: { throwOnError?: boolean }) => Promise<void>;
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
  moveConversationToProject: (conversationId: string, projectId: string | null) => Promise<void>;
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
let managedProjectsLoad: { boundaryKey: string; promise: Promise<Project[]> } | null = null;
let projectLoadGeneration = 0;

function isManagedCloudMode(): boolean {
  return useAppModeStore.getState().mode === 'cloud';
}

function managedProjectBoundaryKey(): string | null {
  if (!isManagedCloudMode()) return null;
  const auth = useAuthStore.getState();
  if (!selectHasCloudAccountSession(auth) || !auth.user) return null;
  return `cloud:${auth.user.id}`;
}

function mergeManagedConversationMembership(projects: Project[], current: Project[]): Project[] {
  const conversations = useChatStore.getState().conversations;
  return projects.map((project) => {
    const hydratedIds = conversations
      .filter((conversation) => conversation.projectId === project.id)
      .map((conversation) => conversation.id);
    const previous = current.find((candidate) => candidate.id === project.id);
    const conversationIds =
      hydratedIds.length > 0 ? hydratedIds : (previous?.conversationIds ?? []);
    return {
      ...project,
      conversationIds,
      conversationCount: Math.max(project.conversationCount ?? 0, conversationIds.length),
    };
  });
}

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
        loadProjects: async (options) => {
          const generation = ++projectLoadGeneration;
          const boundaryAtStart = managedProjectBoundaryKey();
          set({ isLoading: true, error: null });
          try {
            if (isManagedCloudMode()) {
              const boundaryKey = managedProjectBoundaryKey();
              if (!boundaryKey) {
                throw new Error('Managed Cloud projects require an authenticated Cloud session.');
              }
              if (!managedProjectsLoad || managedProjectsLoad.boundaryKey !== boundaryKey) {
                const promise = desktopCloudProjects.listProjects().finally(() => {
                  if (managedProjectsLoad?.promise === promise) managedProjectsLoad = null;
                });
                managedProjectsLoad = { boundaryKey, promise };
              }
              const projects = await managedProjectsLoad.promise;
              if (
                generation !== projectLoadGeneration ||
                managedProjectBoundaryKey() !== boundaryKey
              ) {
                return;
              }
              set((state) => ({
                projects: mergeManagedConversationMembership(projects, state.projects),
                isLoading: false,
              }));
              return;
            }
            if (isTauri) {
              const projects = await invoke<Project[]>('project_list');
              if (generation !== projectLoadGeneration || isManagedCloudMode()) return;
              set({ projects, isLoading: false });
            } else {
              // In web mode, projects are loaded from persisted state
              set({ isLoading: false });
            }
          } catch (error) {
            if (generation !== projectLoadGeneration) return;
            if (
              boundaryAtStart !== managedProjectBoundaryKey() ||
              (boundaryAtStart === null && isManagedCloudMode())
            ) {
              return;
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[ProjectStore] Failed to load projects:', errorMessage);
            set({ error: errorMessage, isLoading: false });
            if (options?.throwOnError) {
              throw error instanceof Error ? error : new Error(errorMessage);
            }
          }
        },

        // Create a new project
        createProject: async (projectData) => {
          set({ isLoading: true, error: null });
          try {
            if (isManagedCloudMode()) {
              const createdProject = await desktopCloudProjects.createProject(projectData);
              set((state) => ({
                projects: [...state.projects, createdProject],
                isLoading: false,
              }));
              return createdProject;
            }
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

            if (isManagedCloudMode()) {
              const updatedProject = await desktopCloudProjects.updateProject(id, updates);
              set((state) => ({
                projects: state.projects.map((project) =>
                  project.id === id
                    ? {
                        ...updatedProject,
                        conversationIds: updates.conversationIds ?? project.conversationIds,
                        conversationCount:
                          updates.conversationIds?.length ?? project.conversationCount,
                      }
                    : project,
                ),
                isLoading: false,
              }));
              return;
            }
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
            if (isManagedCloudMode()) {
              const linkedConversationIds =
                get()
                  .projects.find((project) => project.id === id)
                  ?.conversationIds.slice() ?? [];
              await desktopCloudProjects.deleteProject(id);
              for (const conversationId of linkedConversationIds) {
                useChatStore.getState().setConversationProject(conversationId, null);
              }
            } else if (isTauri) {
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
          const linkedConversationIds =
            get()
              .projects.find((project) => project.id === id)
              ?.conversationIds.slice() ?? [];
          await get().updateProject(id, { isArchived: true });
          if (isManagedCloudMode()) {
            for (const conversationId of linkedConversationIds) {
              useChatStore.getState().setConversationProject(conversationId, null);
            }
            set((state) => ({
              projects: state.projects.map((project) =>
                project.id === id
                  ? { ...project, conversationIds: [], conversationCount: 0 }
                  : project,
              ),
            }));
          }
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
          if (isManagedCloudMode()) {
            throw new Error(
              'Device files stay Local. Upload a Cloud project knowledge file instead.',
            );
          }
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
          if (isManagedCloudMode()) {
            throw new Error('Device project files are only available in Local mode.');
          }
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const updatedFiles = project.files.filter((f) => f.id !== fileId);
          await get().updateProject(projectId, { files: updatedFiles });
        },

        // Add a knowledge base file (with extracted content)
        addKnowledgeBaseFile: async (projectId, fileData) => {
          if (isManagedCloudMode()) {
            throw new Error('Cloud knowledge uploads must use the managed project upload flow.');
          }
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
          if (isManagedCloudMode()) {
            throw new Error(
              'Cloud knowledge files must be removed through the managed project source flow.',
            );
          }
          const project = get().projects.find((p) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }

          const updatedFiles = (project.knowledgeBaseFiles ?? []).filter((f) => f.id !== fileId);
          await get().updateProject(projectId, { knowledgeBaseFiles: updatedFiles });
        },

        // One authoritative project-membership transition. It updates the
        // canonical conversation row once, then projects that result into the
        // chat and project stores. Callers must not pair this with
        // `setConversationProject`, `linkConversation`, or `unlinkConversation`.
        moveConversationToProject: async (conversationId, projectId) => {
          const projectsBefore = get().projects;
          const chatBefore = useChatStore.getState();
          const conversation = chatBefore.conversations.find(
            (candidate) => candidate.id === conversationId,
          );
          if (!conversation) throw new Error('Conversation not found');
          if (projectId && !projectsBefore.some((project) => project.id === projectId)) {
            throw new Error('Project not found');
          }

          const previousProjectId =
            conversation.projectId ??
            projectsBefore.find((project) => project.conversationIds.includes(conversationId))
              ?.id ??
            null;
          if (previousProjectId === projectId) return;

          const projectMembership = (candidate: Project): string[] => {
            const withoutConversation = candidate.conversationIds.filter(
              (id) => id !== conversationId,
            );
            return candidate.id === projectId
              ? [...withoutConversation, conversationId]
              : withoutConversation;
          };

          if (isManagedCloudMode()) {
            useChatStore.getState().setConversationProject(conversationId, projectId);
            set({
              projects: projectsBefore.map((candidate) => {
                const conversationIds = projectMembership(candidate);
                const previousCount =
                  candidate.conversationCount ?? candidate.conversationIds.length;
                const countDelta =
                  candidate.id === previousProjectId ? -1 : candidate.id === projectId ? 1 : 0;
                return {
                  ...candidate,
                  conversationIds,
                  conversationCount: Math.max(0, previousCount + countDelta),
                };
              }),
              error: null,
            });

            try {
              await updateCloudConversation(conversationId, { projectId });
            } catch (error) {
              useChatStore.getState().setConversationProject(conversationId, previousProjectId);
              set({
                projects: projectsBefore,
                error: error instanceof Error ? error.message : String(error),
              });
              throw error;
            }
            return;
          }

          if (previousProjectId) {
            const previousProject = projectsBefore.find(
              (candidate) => candidate.id === previousProjectId,
            );
            if (previousProject) {
              await get().updateProject(previousProjectId, {
                conversationIds: previousProject.conversationIds.filter(
                  (id) => id !== conversationId,
                ),
              });
            }
          }
          if (projectId) {
            const targetProject = get().projects.find((candidate) => candidate.id === projectId);
            if (!targetProject) throw new Error('Project not found');
            await get().updateProject(projectId, {
              conversationIds: Array.from(
                new Set([...targetProject.conversationIds, conversationId]),
              ),
            });
          }
          useChatStore.getState().setConversationProject(conversationId, projectId);
        },

        // Compatibility wrappers delegate to the authoritative transition.
        linkConversation: async (projectId, conversationId) => {
          await get().moveConversationToProject(conversationId, projectId);
        },

        unlinkConversation: async (projectId, conversationId) => {
          const conversation = useChatStore
            .getState()
            .conversations.find((candidate) => candidate.id === conversationId);
          const linkedProject =
            conversation?.projectId ??
            get().projects.find((candidate) => candidate.conversationIds.includes(conversationId))
              ?.id;
          if (linkedProject !== projectId) return;
          await get().moveConversationToProject(conversationId, null);
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
          if (isManagedCloudMode()) {
            throw new Error(
              'Cloud project defaults are not available yet. Project instructions and sources are synced separately.',
            );
          }
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
        partialize: (state) => {
          const localProjects = state.projects.filter(
            (project) => project.defaultPrivacyMode !== 'managed',
          );
          const localProjectIds = new Set(localProjects.map((project) => project.id));
          return {
            projects: localProjects,
            activeProjectId:
              state.activeProjectId && localProjectIds.has(state.activeProjectId)
                ? state.activeProjectId
                : null,
            projectSettings: Object.fromEntries(
              Object.entries(state.projectSettings).filter(([projectId]) =>
                localProjectIds.has(projectId),
              ),
            ),
            currentFolder: state.currentFolder,
            recentFolders: state.recentFolders,
          };
        },
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

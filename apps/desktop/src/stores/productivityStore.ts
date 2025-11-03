import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import type {
  ProductivityProvider,
  Task,
  CreateTaskRequest,
  NotionPage,
  NotionDatabaseQueryRequest,
  NotionCreateRowRequest,
  TrelloBoard,
  TrelloCard,
  TrelloCreateCardRequest,
  TrelloMoveCardRequest,
  TrelloAddCommentRequest,
  AsanaProject,
  AsanaTask,
  AsanaCreateTaskRequest,
  AsanaAssignTaskRequest,
  AsanaMarkCompleteRequest,
  ProductivityCredentials,
  AsanaCredentials,
} from '../types/productivity';

interface ProductivityState {
  // Connection state
  connectedProviders: Set<ProductivityProvider>;
  selectedProvider: ProductivityProvider | null;

  // Tasks
  tasks: Task[];
  selectedTaskId: string | null;

  // Provider-specific data
  notionPages: NotionPage[];
  trelloBoards: TrelloBoard[];
  trelloCards: TrelloCard[];
  asanaProjects: AsanaProject[];
  asanaTasks: AsanaTask[];
  asanaWorkspaceId: string | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Connection actions
  connect: (provider: ProductivityProvider, credentials: ProductivityCredentials) => Promise<void>;
  selectProvider: (provider: ProductivityProvider | null) => void;
  setAsanaWorkspace: (workspaceId: string) => Promise<void>;

  // Task actions
  refreshTasks: () => Promise<void>;
  createTask: (request: CreateTaskRequest) => Promise<string>;
  selectTask: (taskId: string | null) => void;

  // Notion-specific actions
  notionListPages: () => Promise<void>;
  notionQueryDatabase: (request: NotionDatabaseQueryRequest) => Promise<any[]>;
  notionCreateRow: (request: NotionCreateRowRequest) => Promise<string>;

  // Trello-specific actions
  trelloListBoards: () => Promise<void>;
  trelloListCards: (boardId: string) => Promise<void>;
  trelloCreateCard: (request: TrelloCreateCardRequest) => Promise<string>;
  trelloMoveCard: (request: TrelloMoveCardRequest) => Promise<void>;
  trelloAddComment: (request: TrelloAddCommentRequest) => Promise<string>;

  // Asana-specific actions
  asanaListProjects: (workspaceId?: string) => Promise<void>;
  asanaListProjectTasks: (projectId: string) => Promise<void>;
  asanaCreateTask: (request: AsanaCreateTaskRequest) => Promise<string>;
  asanaAssignTask: (request: AsanaAssignTaskRequest) => Promise<void>;
  asanaMarkComplete: (request: AsanaMarkCompleteRequest) => Promise<void>;

  // Utility actions
  clearError: () => void;
}

export const useProductivityStore = create<ProductivityState>((set, get) => ({
  // Initial state
  connectedProviders: new Set(),
  selectedProvider: null,
  tasks: [],
  selectedTaskId: null,
  notionPages: [],
  trelloBoards: [],
  trelloCards: [],
  asanaProjects: [],
  asanaTasks: [],
  asanaWorkspaceId: null,
  loading: false,
  error: null,

  // Connection actions
  connect: async (provider, credentials) => {
    try {
      set({ loading: true, error: null });

      await invoke<{ account_id: string }>('productivity_connect', {
        provider,
        credentials,
      });

      const nextState: Partial<ProductivityState> = {
        connectedProviders: new Set([...get().connectedProviders, provider]),
        selectedProvider: provider,
        loading: false,
      };

      if (provider === 'asana') {
        const asanaCredentials = credentials as AsanaCredentials;
        if (asanaCredentials.workspace_id) {
          nextState.asanaWorkspaceId = asanaCredentials.workspace_id;
        }
      }

      set(nextState);

      toast.success(`Connected to ${provider.charAt(0).toUpperCase() + provider.slice(1)}`);

      await get().refreshTasks();

      set((state) => ({
        // ensure the Set reference is preserved inside Zustand
        connectedProviders: new Set(state.connectedProviders),
      }));

      // Auto-load data based on provider
      if (provider === 'notion') {
        await get().notionListPages();
      } else if (provider === 'trello') {
        await get().trelloListBoards();
      } else if (provider === 'asana') {
        const asanaCredentials = credentials as AsanaCredentials;
        await get().asanaListProjects(asanaCredentials.workspace_id);
      }
    } catch (error) {
      console.error('[productivity] failed to connect', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to connect: ${errorMessage}`);
      throw error;
    }
  },

  selectProvider: (provider) => {
    set({
      selectedProvider: provider,
      tasks: [],
      selectedTaskId: null,
      trelloCards: [],
      notionPages: [],
      asanaTasks: [],
    });

    if (provider) {
      void (async () => {
        await get().refreshTasks();
        if (provider === 'notion') {
          await get().notionListPages();
        } else if (provider === 'trello') {
          await get().trelloListBoards();
        } else if (provider === 'asana') {
          await get().asanaListProjects();
        }
      })();
    }
  },

  setAsanaWorkspace: async (workspaceId) => {
    if (!workspaceId.trim()) {
      toast.error('Workspace ID cannot be empty');
      return;
    }

    set({ asanaWorkspaceId: workspaceId });
    await get().asanaListProjects(workspaceId);
  },

  // Task actions
  refreshTasks: async () => {
    const { selectedProvider } = get();
    if (!selectedProvider) {
      return;
    }

    try {
      set({ loading: true, error: null });

      const tasks = await invoke<Task[]>('productivity_list_tasks', {
        provider: selectedProvider,
      });

      set({ tasks, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list tasks', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  createTask: async (request) => {
    const { selectedProvider } = get();
    if (!selectedProvider) {
      toast.error('Select a provider before creating tasks');
      throw new Error('No provider selected');
    }

    try {
      set({ loading: true, error: null });

      const taskId = await invoke<string>('productivity_create_task', {
        provider: selectedProvider,
        task: request,
      });

      toast.success('Task created');
      await get().refreshTasks();

      set({ loading: false });
      return taskId;
    } catch (error) {
      console.error('[productivity] failed to create task', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to create task: ${errorMessage}`);
      throw error;
    }
  },

  selectTask: (taskId) => {
    set({ selectedTaskId: taskId });
  },

  // Notion-specific actions
  notionListPages: async () => {
    try {
      set({ loading: true, error: null });

      const pages = await invoke<NotionPage[]>('productivity_notion_list_pages');

      set({ notionPages: pages, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Notion pages', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  notionQueryDatabase: async (request) => {
    try {
      set({ loading: true, error: null });

      const results = await invoke<any[]>('productivity_notion_query_database', {
        request,
      });

      set({ loading: false });
      return results;
    } catch (error) {
      console.error('[productivity] failed to query Notion database', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  notionCreateRow: async (request) => {
    try {
      set({ loading: true, error: null });

      const pageId = await invoke<string>('productivity_notion_create_database_row', {
        request,
      });

      toast.success('Notion row created');
      set({ loading: false });
      return pageId;
    } catch (error) {
      console.error('[productivity] failed to create Notion row', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to create row: ${errorMessage}`);
      throw error;
    }
  },

  // Trello-specific actions
  trelloListBoards: async () => {
    try {
      set({ loading: true, error: null });

      const boards = await invoke<TrelloBoard[]>('productivity_trello_list_boards');

      set({ trelloBoards: boards, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Trello boards', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  trelloListCards: async (boardId) => {
    try {
      set({ loading: true, error: null });

      const cards = await invoke<TrelloCard[]>('productivity_trello_list_cards', {
        board_id: boardId,
      });

      set({ trelloCards: cards, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Trello cards', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  trelloCreateCard: async (request) => {
    try {
      set({ loading: true, error: null });

      const cardId = await invoke<string>('productivity_trello_create_card', {
        request,
      });

      toast.success('Trello card created');
      set({ loading: false });
      return cardId;
    } catch (error) {
      console.error('[productivity] failed to create Trello card', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to create card: ${errorMessage}`);
      throw error;
    }
  },

  trelloMoveCard: async (request) => {
    try {
      set({ loading: true, error: null });

      await invoke('productivity_trello_move_card', {
        request,
      });

      toast.success('Card moved');
      set({ loading: false });
    } catch (error) {
      console.error('[productivity] failed to move Trello card', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to move card: ${errorMessage}`);
      throw error;
    }
  },

  trelloAddComment: async (request) => {
    try {
      set({ loading: true, error: null });

      const commentId = await invoke<string>('productivity_trello_add_comment', {
        request,
      });

      toast.success('Comment added');
      set({ loading: false });
      return commentId;
    } catch (error) {
      console.error('[productivity] failed to add comment', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to add comment: ${errorMessage}`);
      throw error;
    }
  },

  // Asana-specific actions
  asanaListProjects: async (workspaceIdParam) => {
    const workspaceId = workspaceIdParam ?? get().asanaWorkspaceId;
    if (!workspaceId) {
      toast.error('Provide a workspace ID to load Asana projects');
      return;
    }

    try {
      set({ loading: true, error: null });

      const projects = await invoke<AsanaProject[]>('productivity_asana_list_projects', {
        workspace_id: workspaceId,
      });

      set({ asanaProjects: projects, asanaWorkspaceId: workspaceId, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Asana projects', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  asanaListProjectTasks: async (projectId) => {
    try {
      set({ loading: true, error: null });

      const tasks = await invoke<AsanaTask[]>('productivity_asana_list_project_tasks', {
        project_id: projectId,
      });

      set({ asanaTasks: tasks, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Asana tasks', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  asanaCreateTask: async (request) => {
    try {
      set({ loading: true, error: null });

      const taskId = await invoke<string>('productivity_asana_create_task', {
        request,
      });

      toast.success('Asana task created');
      set({ loading: false });
      return taskId;
    } catch (error) {
      console.error('[productivity] failed to create Asana task', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to create task: ${errorMessage}`);
      throw error;
    }
  },

  asanaAssignTask: async (request) => {
    try {
      set({ loading: true, error: null });

      await invoke('productivity_asana_assign_task', {
        request,
      });

      toast.success('Task assigned');
      set({ loading: false });
    } catch (error) {
      console.error('[productivity] failed to assign Asana task', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to assign task: ${errorMessage}`);
      throw error;
    }
  },

  asanaMarkComplete: async (request) => {
    try {
      set({ loading: true, error: null });

      await invoke('productivity_asana_mark_complete', {
        request,
      });

      toast.success('Task updated');
      set({ loading: false });
    } catch (error) {
      console.error('[productivity] failed to update Asana task', error);
      const errorMessage = (error as Error).message;
      set({ error: errorMessage, loading: false });
      toast.error(`Failed to update task: ${errorMessage}`);
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

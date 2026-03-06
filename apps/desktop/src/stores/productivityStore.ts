import { toast } from 'sonner';
import { create } from 'zustand';
import { invoke } from '../lib/tauri-mock';

import type {
  AsanaAssignTaskRequest,
  AsanaCreateTaskRequest,
  AsanaCredentials,
  AsanaMarkCompleteRequest,
  AsanaProject,
  AsanaTask,
  CreateTaskRequest,
  NotionCreateRowRequest,
  NotionDatabaseQueryRequest,
  NotionPage,
  ProductivityCredentials,
  ProductivityProvider,
  Task,
  TrelloAddCommentRequest,
  TrelloBoard,
  TrelloCard,
  TrelloCreateCardRequest,
  TrelloMoveCardRequest,
} from '../types/productivity';

// AUDIT-006-010/011: Array caps to prevent unbounded memory growth
const PRODUCTIVITY_LIMITS = {
  tasks: 500,
  notionPages: 200,
  trelloBoards: 100,
  trelloCards: 500,
  asanaProjects: 100,
  asanaTasks: 500,
} as const;

interface ProductivityState {
  connectedProviders: Set<ProductivityProvider>;
  selectedProvider: ProductivityProvider | null;

  tasks: Task[];
  selectedTaskId: string | null;

  notionPages: NotionPage[];
  trelloBoards: TrelloBoard[];
  trelloCards: TrelloCard[];
  asanaProjects: AsanaProject[];
  asanaTasks: AsanaTask[];
  asanaWorkspaceId: string | null;

  loading: boolean;
  error: string | null;

  connect: (provider: ProductivityProvider, credentials: ProductivityCredentials) => Promise<void>;
  selectProvider: (provider: ProductivityProvider | null) => void;
  setAsanaWorkspace: (workspaceId: string) => Promise<void>;

  refreshTasks: () => Promise<void>;
  createTask: (request: CreateTaskRequest) => Promise<string>;
  selectTask: (taskId: string | null) => void;

  notionListPages: () => Promise<void>;
  notionQueryDatabase: (request: NotionDatabaseQueryRequest) => Promise<unknown[]>;
  notionCreateRow: (request: NotionCreateRowRequest) => Promise<string>;

  trelloListBoards: () => Promise<void>;
  trelloListCards: (boardId: string) => Promise<void>;
  trelloCreateCard: (request: TrelloCreateCardRequest) => Promise<string>;
  trelloMoveCard: (request: TrelloMoveCardRequest) => Promise<void>;
  trelloAddComment: (request: TrelloAddCommentRequest) => Promise<string>;

  asanaListProjects: (workspaceId?: string) => Promise<void>;
  asanaListProjectTasks: (projectId: string) => Promise<void>;
  asanaCreateTask: (request: AsanaCreateTaskRequest) => Promise<string>;
  asanaAssignTask: (request: AsanaAssignTaskRequest) => Promise<void>;
  asanaMarkComplete: (request: AsanaMarkCompleteRequest) => Promise<void>;

  clearError: () => void;
  resetOnLogout: () => void;
}

export const useProductivityStore = create<ProductivityState>((set, get) => ({
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
        connectedProviders: new Set(state.connectedProviders),
      }));

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

      // AUDIT-006-010: Cap tasks array to prevent unbounded memory growth
      const cappedTasks = tasks.slice(0, PRODUCTIVITY_LIMITS.tasks);
      set({ tasks: cappedTasks, loading: false });
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

      const result = await invoke<{ task_id: string; success: boolean }>(
        'productivity_create_task',
        {
          provider: selectedProvider,
          task: request,
        },
      );
      const taskId = result.task_id;

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

  notionListPages: async () => {
    try {
      set({ loading: true, error: null });

      const pages = await invoke<NotionPage[]>('productivity_notion_list_pages');

      // AUDIT-006-010: Cap notionPages array to prevent unbounded memory growth
      const cappedPages = pages.slice(0, PRODUCTIVITY_LIMITS.notionPages);
      set({ notionPages: cappedPages, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Notion pages', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  notionQueryDatabase: async (request) => {
    try {
      set({ loading: true, error: null });

      const results = await invoke<unknown[]>('productivity_notion_query_database', {
        databaseId: request.database_id,
        filter: request.filter ?? null,
        sorts: request.sorts ?? null,
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
        databaseId: request.database_id,
        properties: request.properties,
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

  trelloListBoards: async () => {
    try {
      set({ loading: true, error: null });

      const boards = await invoke<TrelloBoard[]>('productivity_trello_list_boards');

      // AUDIT-006-010: Cap trelloBoards array to prevent unbounded memory growth
      const cappedBoards = boards.slice(0, PRODUCTIVITY_LIMITS.trelloBoards);
      set({ trelloBoards: cappedBoards, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Trello boards', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  trelloListCards: async (boardId) => {
    try {
      set({ loading: true, error: null });

      const cards = await invoke<TrelloCard[]>('productivity_trello_list_cards', {
        boardId,
      });

      // AUDIT-006-010: Cap trelloCards array to prevent unbounded memory growth
      const cappedCards = cards.slice(0, PRODUCTIVITY_LIMITS.trelloCards);
      set({ trelloCards: cappedCards, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Trello cards', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  trelloCreateCard: async (request) => {
    try {
      set({ loading: true, error: null });

      const cardId = await invoke<string>('productivity_trello_create_card', {
        listId: request.list_id,
        name: request.name,
        description: request.description ?? null,
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
        cardId: request.card_id,
        listId: request.list_id,
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
        cardId: request.card_id,
        text: request.text,
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

      // AUDIT-006-010: Cap asanaProjects array to prevent unbounded memory growth
      const cappedProjects = projects.slice(0, PRODUCTIVITY_LIMITS.asanaProjects);
      set({ asanaProjects: cappedProjects, asanaWorkspaceId: workspaceId, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Asana projects', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  asanaListProjectTasks: async (projectId) => {
    try {
      set({ loading: true, error: null });

      const tasks = await invoke<AsanaTask[]>('productivity_asana_list_project_tasks', {
        projectId,
      });

      // AUDIT-006-010: Cap asanaTasks array to prevent unbounded memory growth
      const cappedTasks = tasks.slice(0, PRODUCTIVITY_LIMITS.asanaTasks);
      set({ asanaTasks: cappedTasks, loading: false });
    } catch (error) {
      console.error('[productivity] failed to list Asana tasks', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  asanaCreateTask: async (request) => {
    try {
      set({ loading: true, error: null });

      const taskId = await invoke<string>('productivity_asana_create_task', {
        name: request.name,
        notes: request.notes ?? null,
        workspaceId: request.workspace_id ?? null,
        projectId: request.project_id ?? null,
        assigneeId: request.assignee_id ?? null,
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
        taskId: request.task_id,
        assigneeId: request.assignee_id,
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
        taskId: request.task_id,
        completed: request.completed,
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

  // AUDIT-006-011: Reset all arrays on logout to prevent memory leaks
  resetOnLogout: () => {
    set({
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
    });
    console.debug('[ProductivityStore] Reset on logout');
  },
}));

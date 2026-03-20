/**
 * Productivity API
 *
 * TypeScript wrappers for the productivity integration Tauri commands.
 * Provides connections to Notion, Trello, and Asana with unified task
 * management and provider-specific operations.
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** Supported productivity providers */
export type ProductivityProvider = 'notion' | 'trello' | 'asana' | 'todoist' | 'jira';

/** Generic task representation across providers */
export interface ProductivityTask {
  id: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  assignee?: string;
  labels?: string[];
  url?: string;
}

/** Response from connecting to a provider */
export interface ConnectResponse {
  accountId: string;
  success: boolean;
}

/** Response from creating a task */
export interface CreateTaskResponse {
  taskId: string;
  success: boolean;
}

// ============================================================================
// Core Operations
// ============================================================================

/** Connect to a productivity provider with credentials */
export async function productivityConnect(
  provider: ProductivityProvider,
  credentials: Record<string, unknown>,
): Promise<ConnectResponse> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    if (!credentials || Object.keys(credentials).length === 0) {
      throw new Error('Credentials are required to connect to a productivity provider');
    }
    return await invoke<ConnectResponse>('productivity_connect', {
      provider,
      credentials,
    });
  } catch (error) {
    console.error('[productivity] failed to connect', error);
    throw error;
  }
}

/** List tasks from a provider */
export async function productivityListTasks(
  provider: ProductivityProvider,
): Promise<ProductivityTask[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<ProductivityTask[]>('productivity_list_tasks', { provider });
  } catch (error) {
    console.error('[productivity] failed to list tasks', error);
    throw error;
  }
}

/** Create a task in a provider */
export async function productivityCreateTask(
  provider: ProductivityProvider,
  task: ProductivityTask,
): Promise<CreateTaskResponse> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<CreateTaskResponse>('productivity_create_task', {
      provider,
      task,
    });
  } catch (error) {
    console.error('[productivity] failed to create task', error);
    throw error;
  }
}

// ============================================================================
// Notion Operations
// ============================================================================

/** List all Notion pages */
export async function productivityNotionListPages(): Promise<unknown[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<unknown[]>('productivity_notion_list_pages');
  } catch (error) {
    console.error('[productivity] failed to list Notion pages', error);
    throw error;
  }
}

/** Query a Notion database with optional filter and sorts */
export async function productivityNotionQueryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Record<string, unknown>[],
): Promise<unknown[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<unknown[]>('productivity_notion_query_database', {
      databaseId,
      filter: filter ?? null,
      sorts: sorts ?? null,
    });
  } catch (error) {
    console.error('[productivity] failed to query Notion database', error);
    throw error;
  }
}

/** Create a row in a Notion database */
export async function productivityNotionCreateDatabaseRow(
  databaseId: string,
  properties: Record<string, unknown>,
): Promise<string> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<string>('productivity_notion_create_database_row', {
      databaseId,
      properties,
    });
  } catch (error) {
    console.error('[productivity] failed to create Notion database row', error);
    throw error;
  }
}

// ============================================================================
// Trello Operations
// ============================================================================

/** List all Trello boards */
export async function productivityTrelloListBoards(): Promise<unknown[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<unknown[]>('productivity_trello_list_boards');
  } catch (error) {
    console.error('[productivity] failed to list Trello boards', error);
    throw error;
  }
}

/** List cards in a Trello board */
export async function productivityTrelloListCards(boardId: string): Promise<ProductivityTask[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<ProductivityTask[]>('productivity_trello_list_cards', { boardId });
  } catch (error) {
    console.error('[productivity] failed to list Trello cards', error);
    throw error;
  }
}

/** Create a card in a Trello list */
export async function productivityTrelloCreateCard(
  listId: string,
  name: string,
  description?: string,
): Promise<string> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<string>('productivity_trello_create_card', {
      listId,
      name,
      description: description ?? null,
    });
  } catch (error) {
    console.error('[productivity] failed to create Trello card', error);
    throw error;
  }
}

/** Move a Trello card to a different list */
export async function productivityTrelloMoveCard(cardId: string, listId: string): Promise<void> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    await invoke<void>('productivity_trello_move_card', { cardId, listId });
  } catch (error) {
    console.error('[productivity] failed to move Trello card', error);
    throw error;
  }
}

/** Add a comment to a Trello card */
export async function productivityTrelloAddComment(cardId: string, text: string): Promise<string> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<string>('productivity_trello_add_comment', { cardId, text });
  } catch (error) {
    console.error('[productivity] failed to add Trello comment', error);
    throw error;
  }
}

// ============================================================================
// Asana Operations
// ============================================================================

/** List Asana projects in a workspace */
export async function productivityAsanaListProjects(workspaceId: string): Promise<unknown[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<unknown[]>('productivity_asana_list_projects', { workspaceId });
  } catch (error) {
    console.error('[productivity] failed to list Asana projects', error);
    throw error;
  }
}

/** List tasks in an Asana project */
export async function productivityAsanaListProjectTasks(
  projectId: string,
): Promise<ProductivityTask[]> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<ProductivityTask[]>('productivity_asana_list_project_tasks', {
      projectId,
    });
  } catch (error) {
    console.error('[productivity] failed to list Asana project tasks', error);
    throw error;
  }
}

/** Create a task in Asana */
export async function productivityAsanaCreateTask(
  name: string,
  notes?: string,
  workspaceId?: string,
  projectId?: string,
  assigneeId?: string,
): Promise<string> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    return await invoke<string>('productivity_asana_create_task', {
      name,
      notes: notes ?? null,
      workspaceId: workspaceId ?? null,
      projectId: projectId ?? null,
      assigneeId: assigneeId ?? null,
    });
  } catch (error) {
    console.error('[productivity] failed to create Asana task', error);
    throw error;
  }
}

/** Assign an Asana task to a user */
export async function productivityAsanaAssignTask(
  taskId: string,
  assigneeId: string,
): Promise<void> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    await invoke<void>('productivity_asana_assign_task', { taskId, assigneeId });
  } catch (error) {
    console.error('[productivity] failed to assign Asana task', error);
    throw error;
  }
}

/** Mark an Asana task as complete or incomplete */
export async function productivityAsanaMarkComplete(
  taskId: string,
  completed: boolean,
): Promise<void> {
  try {
    if (!isTauri) throw new Error('Productivity requires Tauri runtime');
    await invoke<void>('productivity_asana_mark_complete', { taskId, completed });
  } catch (error) {
    console.error('[productivity] failed to mark Asana task complete', error);
    throw error;
  }
}

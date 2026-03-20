/**
 * Productivity API — typed wrappers for Notion, Trello, Asana integration commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export type Provider = 'notion' | 'trello' | 'asana';
export interface ConnectResponse {
  success: boolean;
  accountId: string;
}
export interface ProductivityTask {
  id: string;
  name: string;
  description?: string;
  status: string;
  assignee?: string;
  dueDate?: string;
}
export interface CreateTaskResponse {
  taskId: string;
}

// ---- Core ----

export async function productivityConnect(
  provider: Provider,
  credentials: unknown,
): Promise<ConnectResponse> {
  return command<ConnectResponse>('productivity_connect', { provider, credentials });
}
export async function productivityListTasks(provider: Provider): Promise<ProductivityTask[]> {
  return command<ProductivityTask[]>('productivity_list_tasks', { provider });
}
export async function productivityCreateTask(
  provider: Provider,
  task: ProductivityTask,
): Promise<CreateTaskResponse> {
  return command<CreateTaskResponse>('productivity_create_task', { provider, task });
}

// ---- Notion ----

export async function productivityNotionListPages(): Promise<unknown[]> {
  return command<unknown[]>('productivity_notion_list_pages');
}
export async function productivityNotionQueryDatabase(
  databaseId: string,
  filter?: unknown,
  sorts?: unknown[],
): Promise<unknown[]> {
  return command<unknown[]>('productivity_notion_query_database', { databaseId, filter, sorts });
}
export async function productivityNotionCreateDatabaseRow(
  databaseId: string,
  properties: unknown,
): Promise<string> {
  return command<string>('productivity_notion_create_database_row', { databaseId, properties });
}

// ---- Trello ----

export async function productivityTrelloListBoards(): Promise<unknown[]> {
  return command<unknown[]>('productivity_trello_list_boards');
}
export async function productivityTrelloListCards(boardId: string): Promise<ProductivityTask[]> {
  return command<ProductivityTask[]>('productivity_trello_list_cards', { boardId });
}
export async function productivityTrelloCreateCard(
  listId: string,
  name: string,
  description?: string,
): Promise<string> {
  return command<string>('productivity_trello_create_card', { listId, name, description });
}
export async function productivityTrelloMoveCard(cardId: string, listId: string): Promise<void> {
  return command<void>('productivity_trello_move_card', { cardId, listId });
}
export async function productivityTrelloAddComment(cardId: string, text: string): Promise<string> {
  return command<string>('productivity_trello_add_comment', { cardId, text });
}

// ---- Asana ----

export async function productivityAsanaListProjects(workspaceId: string): Promise<unknown[]> {
  return command<unknown[]>('productivity_asana_list_projects', { workspaceId });
}
export async function productivityAsanaListProjectTasks(
  projectId: string,
): Promise<ProductivityTask[]> {
  return command<ProductivityTask[]>('productivity_asana_list_project_tasks', { projectId });
}
export async function productivityAsanaCreateTask(
  name: string,
  notes?: string,
  workspaceId?: string,
  projectId?: string,
  assigneeId?: string,
): Promise<string> {
  return command<string>('productivity_asana_create_task', {
    name,
    notes,
    workspaceId,
    projectId,
    assigneeId,
  });
}
export async function productivityAsanaAssignTask(
  taskId: string,
  assigneeId: string,
): Promise<void> {
  return command<void>('productivity_asana_assign_task', { taskId, assigneeId });
}
export async function productivityAsanaMarkComplete(
  taskId: string,
  completed: boolean,
): Promise<void> {
  return command<void>('productivity_asana_mark_complete', { taskId, completed });
}

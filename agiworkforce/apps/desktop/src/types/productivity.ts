export type ProductivityProvider = 'notion' | 'trello' | 'asana';

export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  due_date?: string | null;
  assignee?: string | null;
  priority?: number | null;
  tags: string[];
  url?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  project_id?: string | null;
  due_date?: string | null;
  assignee?: string | null;
  priority?: number | null;
  tags?: string[];
}

// Notion-specific types

export interface NotionPage {
  id: string;
  properties: Record<string, any>;
  url: string;
  created_time: string;
  last_edited_time: string;
}

export interface NotionDatabaseQueryRequest {
  database_id: string;
  filter?: Record<string, any> | null;
  sorts?: Array<Record<string, any>> | null;
}

export interface NotionCreateRowRequest {
  database_id: string;
  properties: Record<string, any>;
}

// Trello-specific types

export interface TrelloBoard {
  id: string;
  name: string;
  url: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  list_id: string;
  board_id: string;
  url: string;
  due?: string | null;
  date_last_activity: string;
  labels: TrelloLabel[];
}

export interface TrelloLabel {
  name: string;
  color: string;
}

export interface TrelloCreateCardRequest {
  list_id: string;
  name: string;
  description?: string | null;
  due?: string | null;
}

export interface TrelloMoveCardRequest {
  card_id: string;
  list_id: string;
}

export interface TrelloAddCommentRequest {
  card_id: string;
  text: string;
}

// Asana-specific types

export interface AsanaProject {
  gid: string;
  name: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes?: string | null;
  completed: boolean;
  due_on?: string | null;
  due_at?: string | null;
  assignee?: AsanaUser | null;
  projects?: AsanaProject[] | null;
  tags?: AsanaTag[] | null;
  created_at: string;
  modified_at: string;
  permalink_url: string;
}

export interface AsanaUser {
  gid: string;
  name: string;
  email: string;
}

export interface AsanaTag {
  gid: string;
  name: string;
}

export interface AsanaCreateTaskRequest {
  name: string;
  notes?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  assignee_id?: string | null;
  due_on?: string | null;
}

export interface AsanaAssignTaskRequest {
  task_id: string;
  assignee_id: string;
}

export interface AsanaMarkCompleteRequest {
  task_id: string;
  completed: boolean;
}

// Connection credentials

export interface NotionCredentials {
  token: string;
}

export interface TrelloCredentials {
  api_key: string;
  token: string;
}

export interface AsanaCredentials {
  token: string;
}

export type ProductivityCredentials = NotionCredentials | TrelloCredentials | AsanaCredentials;

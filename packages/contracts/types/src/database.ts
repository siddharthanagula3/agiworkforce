/**
 * Database entity types: cloud schema mirrors.
 *
 * These interfaces exactly match the column layouts in cloud migration folders.
 * They are used by the web app, mobile app, and VS Code extension to type
 * responses from shared database APIs.
 *
 * The desktop app uses SQLite as source of truth; a sync client writes
 * deterministic-UUID copies of local rows into cloud persistence.
 *
 * @module database
 * @packageDocumentation
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type ConversationSource = 'desktop' | 'web' | 'mobile' | 'extension' | 'vscode';

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  model: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count: number;
  metadata: Record<string, unknown>;
  source: ConversationSource;
}

export type ConversationInsert = Omit<
  ConversationRow,
  'id' | 'created_at' | 'updated_at' | 'last_message_at' | 'message_count'
> & {
  id?: string;
};

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  provider: string | null;
  token_count: number;
  cost: number;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type MessageInsert = Omit<MessageRow, 'id' | 'created_at'> & {
  id?: string;
};

export type WorkforceTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkforceTaskRow {
  id: string;
  user_id: string;
  employee_id: string;
  title: string;
  description: string | null;
  status: WorkforceTaskStatus;
  priority: number;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

export type WorkforceExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkforceExecutionRow {
  id: string;
  task_id: string;
  user_id: string;
  employee_id: string;
  started_at: string;
  completed_at: string | null;
  status: WorkforceExecutionStatus;
  duration_ms: number | null;
  tokens_used: number;
  cost_estimate: number;
  result: Record<string, unknown> | null;
  error: string | null;
  updated_at: string;
}

export interface SharedSessionRow {
  id: string;
  token: string;
  owner_id: string;
  title: string;
  model_id: string | null;
  provider: string | null;
  messages: unknown[];
  total_messages: number;
  expires_at: string;
  created_at: string;
}

export type GithubAccountType = 'User' | 'Organization';

export interface GithubInstallationRow {
  id: string;
  user_id: string;
  installation_id: number;
  account_login: string;
  account_type: GithubAccountType;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  pr_review_enabled: boolean;
  review_model: string;
  created_at: string;
}

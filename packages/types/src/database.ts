/**
 * Database entity types — Supabase schema mirrors.
 *
 * These interfaces exactly match the column layouts in supabase/migrations/.
 * They are used by the web app, mobile app, and VS Code extension to type
 * responses from the Supabase REST and Realtime APIs.
 *
 * The desktop app uses SQLite as source of truth; the Rust sync client
 * (supabase_sync.rs) writes deterministic-UUID copies of local rows here.
 *
 * @module database
 * @packageDocumentation
 */

// ============================================================================
// Shared enums
// ============================================================================

/** Valid roles for a chat message across all message tables. */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Source platform that created a conversation. */
export type ConversationSource = 'desktop' | 'web' | 'mobile' | 'extension' | 'vscode';

// ============================================================================
// conversations (20260308120001)
// ============================================================================

/** Row shape for public.conversations. */
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

/** Payload for inserting a new conversation. */
export type ConversationInsert = Omit<
  ConversationRow,
  'id' | 'created_at' | 'updated_at' | 'last_message_at' | 'message_count'
> & {
  id?: string;
};

// ============================================================================
// messages (20260308120002)
// ============================================================================

/** Row shape for public.messages. */
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

/** Payload for inserting a new message. */
export type MessageInsert = Omit<MessageRow, 'id' | 'created_at'> & {
  id?: string;
};

// ============================================================================
// workforce_tasks (20260308100003)
// ============================================================================

export type WorkforceTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Row shape for public.workforce_tasks. */
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

// ============================================================================
// workforce_executions (20260308100004)
// ============================================================================

export type WorkforceExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** Row shape for public.workforce_executions. */
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

// ============================================================================
// shared_sessions (20260307000001)
// ============================================================================

/** Row shape for public.shared_sessions. */
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

// ============================================================================
// github_installations (20260307000002)
// ============================================================================

export type GithubAccountType = 'User' | 'Organization';

/** Row shape for public.github_installations. */
export interface GithubInstallationRow {
  id: string;
  user_id: string;
  installation_id: number;
  account_login: string;
  account_type: GithubAccountType;
  /** Encrypted access token — never expose to the frontend. */
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  pr_review_enabled: boolean;
  review_model: string;
  created_at: string;
}

/**
 * Extended Supabase Database types
 *
 * Adds stub table/function definitions for tables referenced in code
 * but not yet present in the auto-generated schema (supabase.ts).
 * This allows supabase.from('table_name') to compile without errors
 * while preserving full type safety for tables that ARE in the schema.
 */

import type { Database } from './supabase';

// Permissive stub types for tables not yet in the Supabase schema.
// Using `any` ensures supabase .select(), .insert(), .update(), .upsert()
// all compile without narrowing to `never`.
type StubTable = {
  Row: Record<string, any>;
  Insert: Record<string, any>;
  Update: Record<string, any>;
  Relationships: [];
};

// Permissive stub for RPC functions not yet in schema
type StubFunction = {
  Args: Record<string, any>;
  Returns: any;
};

// Tables referenced in code but missing from generated schema
interface MissingTables {
  ai_employees: StubTable;
  ai_tools: StubTable;
  agent_collaborations: StubTable;
  agent_messages: StubTable;
  analytics_events: StubTable;
  api_keys: StubTable;
  api_usage: StubTable;
  audit_logs: StubTable;
  backup_metadata: StubTable;
  backup_storage: StubTable;
  blog_categories: StubTable;
  blog_posts: StubTable;
  cache_entries: StubTable;
  employee_memories: StubTable;
  faq_items: StubTable;
  faqs: StubTable;
  help_articles: StubTable;
  job_assignments: StubTable;
  organization_members: StubTable;
  organizations: StubTable;
  public_artifacts: StubTable;
  resources: StubTable;
  shared_artifacts: StubTable;
  social_media_analyses: StubTable;
  subscription_plans: StubTable;
  support_categories: StubTable;
  support_ticket_replies: StubTable;
  support_tickets: StubTable;
  token_transactions: StubTable;
  tool_executions: StubTable;
  user_activity: StubTable;
  user_dashboard_stats: StubTable;
  user_profiles: StubTable;
  user_recent_activity: StubTable;
  user_settings: StubTable;
  user_subscriptions: StubTable;
  user_token_balances: StubTable;
  users: StubTable;
  vibe_agent_actions: StubTable;
  vibe_agent_messages: StubTable;
  vibe_messages: StubTable;
  workforce_executions: StubTable;
  workforce_tasks: StubTable;
}

// RPC functions referenced in code but missing from generated schema
interface MissingFunctions {
  add_user_tokens: StubFunction;
  admin_unlock_account: StubFunction;
  check_account_lockout: StubFunction;
  deduct_user_tokens: StubFunction;
  get_lockout_stats: StubFunction;
  get_or_create_token_balance: StubFunction;
  get_session_branches: StubFunction;
  increment_token_usage: StubFunction;
  increment_vibe_session_tokens: StubFunction;
  log_security_event: StubFunction;
  record_failed_login: StubFunction;
  record_successful_login: StubFunction;
  user_dashboard_stats: StubFunction;
  user_recent_activity: StubFunction;
}

/**
 * Extended Database type that includes both generated schema tables
 * and stub definitions for tables/functions not yet in the schema.
 */
export type ExtendedDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Database['public']['Tables'] & MissingTables;
    Functions: Database['public']['Functions'] & MissingFunctions;
  };
};

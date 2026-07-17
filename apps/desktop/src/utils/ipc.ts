import { invoke as tauriInvoke } from '@tauri-apps/api/core';

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Error with a code property for categorization.
 */
interface CodedError extends Error {
  code: string;
}

/**
 * Creates an error with a code property.
 */
function createCodedError(message: string, code: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

function assertAllowedCommandName(command: string): void {
  if (!COMMAND_NAME_PATTERN.test(command)) {
    throw createCodedError(`Invalid IPC command name: ${command}`, 'INVALID_COMMAND');
  }

  if (
    ALLOWED_GENERIC_COMMANDS.has(command) ||
    ALLOWED_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix))
  ) {
    return;
  }

  throw createCodedError(
    `IPC command is not registered in the frontend allowlist: ${command}`,
    'UNKNOWN_COMMAND',
  );
}

const MAX_PAYLOAD_BYTES = 256 * 1024;
const WINDOW_MS = 1000;
const MAX_REQS_PER_WINDOW = 30;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const ALLOWED_COMMAND_PREFIXES = [
  'account_',
  'agent_',
  'agi_',
  'analytics_',
  'api_',
  'app_permissions_',
  'auth_',
  'background_task_',
  'bg_',
  'billing_',
  'browser_',
  'budget_',
  'cache_',
  'calendar_',
  'canvas_',
  'capture_',
  'chat_',
  'cloud_',
  'code_',
  'codebase_cache_',
  'coding_checkpoint_',
  'composer_',
  'computer_use_',
  'contact_',
  'conversation_',
  'coord_',
  'db_',
  'design_',
  'device_link_',
  'dir_',
  'dispatch_hmac_',
  'document_',
  'email_',
  'error_',
  'extension_',
  'feature_flag_',
  'file_',
  'form_undo_',
  'format_',
  'fs_',
  'git_',
  'google_batch_',
  'knowledge_',
  'llm_',
  'lsp_',
  'master_password_',
  'mcp_',
  'mcpb_',
  'media_',
  'memory_',
  'messaging_',
  'metrics_',
  'notification_',
  'oauth_',
  'ocr_',
  'ollama_',
  'orchestrator_',
  'privacy_',
  'productivity_',
  'project_',
  'project_context_',
  'research_',
  'router_',
  'scheduler_',
  'screen_watcher_',
  'search_',
  'secret_manager_',
  'settings_',
  'settings_v2_',
  'shortcuts_',
  'skill_',
  'speech_',
  'stripe_',
  'swarm_',
  'task_',
  'terminal_',
  'thinking_',
  'timeout_',
  'undo_',
  'vision_',
  'voice_',
  'window_',
  'workspace_',
] as const;

const ALLOWED_GENERIC_COMMANDS = new Set([
  'accept_invitation',
  'acknowledge_milestone',
  'add_team_seats',
  'apply_changes',
  'approve_operation',
  'approve_request',
  'auto_save_decision',
  'calculate_risk_level',
  'calculate_team_cost',
  'cancel_subscription',
  'cancel_tool_confirmation',
  'cancel_tool_execution',
  'cancel_workflow',
  'check_connectivity',
  'clear_model_capability_cache',
  'clear_project_memories',
  'clear_remembered_tool_choice',
  'clear_remembered_tool_choices',
  'clear_sample_data',
  'click_semantic',
  'clone_marketplace_workflow',
  'comment_on_workflow',
  'compare_to_industry_benchmark',
  'compare_to_manual',
  'compare_to_previous_period',
  'complete_first_run',
  'complete_onboarding_step',
  'complete_tutorial',
  'complete_tutorial_step',
  'connect_slack',
  'connect_teams',
  'connect_websocket',
  'connect_whatsapp',
  'create_approval_request',
  'create_team',
  'create_workflow',
  'delete_autonomous_task_checkpoint',
  'delete_autonomous_task_checkpoints',
  'delete_custom_agent',
  'delete_project_memory',
  'delete_team',
  'delete_workflow',
  'delete_workflow_comment',
  'disconnect_platform',
  'execute_code',
  'execute_template',
  'execute_terminal_command',
  'execute_workflow',
  'expire_timed_out_requests',
  'export_roi_report',
  'export_user_data',
  'favorite_workflow',
  'fetch_credit_balance',
  'fetch_user_profile',
  'find_all_elements_semantic',
  'find_by_role',
  'find_element_semantic',
  'fork_marketplace_workflow',
  'generate_image',
  'get_accessibility_tree',
  'get_agent_mode',
  'get_all_templates',
  'get_all_time_stats',
  'get_approval_statistics',
  'get_architectural_decisions',
  'get_audit_events',
  'get_auto_approve_all',
  'get_benchmark_comparison',
  'get_category_counts',
  'get_coding_styles',
  'get_creator_workflows',
  'get_current_plan',
  'get_dom_semantic_graph',
  'get_execution_logs',
  'get_featured_workflows',
  'get_file_diff',
  'get_first_run_session',
  'get_first_run_statistics',
  'get_installed_templates',
  'get_interactive_elements',
  'get_knowledge_by_category',
  'get_local_user_id',
  'get_manual_vs_automated_comparison',
  'get_messaging_history',
  'get_metrics_history',
  'get_milestones',
  'get_month_stats',
  'get_my_published_workflows',
  'get_next_execution_time',
  'get_onboarding_status',
  'get_outcome_tracking',
  'get_pending_approvals',
  'get_pending_confirmation_count',
  'get_period_comparison',
  'get_popular_tags',
  'get_pricing_plans',
  'get_process_statistics',
  'get_project_context',
  'get_project_memories',
  'get_prompt_completion',
  'get_published_workflows',
  'get_realtime_stats',
  'get_recent_activity',
  'get_recent_conversations',
  'get_recent_knowledge',
  'get_recommended_tutorial',
  'get_session_info',
  'get_settings',
  'get_system_resources',
  'get_team',
  'get_team_activity',
  'get_team_billing',
  'get_team_invitations',
  'get_team_members',
  'get_team_presence',
  'get_team_resources',
  'get_team_resources_by_type',
  'get_template_by_id',
  'get_template_categories',
  'get_templates_by_category',
  'get_today_stats',
  'get_tool_safety_tier',
  'get_trending_workflows',
  'get_tutorial',
  'get_tutorial_progress',
  'get_tutorial_stats',
  'get_tutorials',
  'get_user_clones',
  'get_user_credits',
  'get_user_favorites',
  'get_user_preference',
  'get_user_rewards',
  'get_user_team_activity',
  'get_user_teams',
  'get_user_tutorial_progress',
  'get_user_workflow_rating',
  'get_user_workflows',
  'get_week_stats',
  'get_workflow',
  'get_workflow_analytics',
  'get_workflow_by_id',
  'get_workflow_by_share_url',
  'get_workflow_comments',
  'get_workflow_embed_code',
  'get_workflow_reviews',
  'get_workflow_share_url',
  'get_workflow_stats',
  'get_workflow_status',
  'get_workflow_templates',
  'get_workflow_templates_by_category',
  'get_workflows_by_category',
  'glob_search',
  'grep_search',
  'has_completed_first_run',
  'has_reward',
  'has_sample_data',
  'has_unlocked_feature',
  'increment_workflow_view_count',
  'initialize_team_billing',
  'install_template',
  'invite_member',
  'is_workflow_favorited',
  'list_autonomous_task_checkpoints',
  'list_autonomous_task_checkpoints_by_task',
  'list_custom_agents',
  'list_messaging_connections',
  'load_custom_instructions',
  'log_tool_execution',
  'log_workflow_execution',
  'mark_setup_completed',
  'open_file_location',
  'pause_agent',
  'pause_workflow',
  'populate_sample_data',
  'publish_workflow',
  'publish_workflow_to_marketplace',
  'query_knowledge',
  'rate_workflow',
  'record_automation_metrics',
  'record_demo_results',
  'record_help_session',
  'record_step_view',
  'refresh_agent_status',
  'reject_operation',
  'reject_request',
  'remove_member',
  'remove_team_seats',
  'report_llm_usage',
  'requires_approval',
  'reset_onboarding',
  'reset_session_cost',
  'reset_tutorial',
  'respond_tool_confirmation',
  'resume_agent',
  'resume_autonomous_task',
  'resume_workflow',
  'revert_changes',
  'run_instant_demo',
  'save_architectural_decision',
  'save_coding_style',
  'save_custom_agent',
  'save_custom_instructions',
  'save_project_context',
  'schedule_workflow',
  'select_demo',
  'send_message',
  'set_agent_mode',
  'set_auto_approve_all',
  'set_tool_approval_policy',
  'set_user_offline',
  'set_user_online',
  'set_user_preference',
  'share_milestone',
  'share_resource',
  'share_workflow',
  'skip_first_run',
  'skip_onboarding_step',
  'skip_tutorial_step',
  'start_agent_task',
  'start_first_run_experience',
  'start_tutorial',
  'submit_tutorial_feedback',
  'subscribe_to_plan',
  'sync_capabilities',
  'test_selector_strategies',
  'toggle_trigger',
  'track_workflow_view',
  'transfer_cloud_to_local',
  'transfer_local_to_cloud',
  'transfer_team_ownership',
  'trigger_workflow_on_event',
  'type_semantic',
  'unfavorite_workflow',
  'uninstall_template',
  'unpublish_workflow',
  'unregister_trigger',
  'unshare_resource',
  'update_allowed_directories',
  'update_first_run_step',
  'update_member_role',
  'update_memory_importance',
  'update_session_activity',
  'update_team',
  'update_team_plan',
  'update_team_settings',
  'update_team_usage',
  'update_trigger',
  'update_user_activity',
  'update_workflow',
  'upgrade_plan',
  'upload_file',
  'verify_audit_event',
  'verify_audit_integrity',
]);

const COMMAND_TIMEOUTS: Record<string, number> = {
  auth_login: 60000,
  auth_register: 60000,
  auth_refresh_token: 30000,

  read_file: 60000,
  file_write: 60000,

  execute_command: 120000,

  get_onboarding_status: 5000,

  // Chat commands: blocking until the full LLM response (including agentic
  // loops and SSE streaming) completes before returning. Use a 10-minute
  // ceiling to cover deep-research and multi-step agentic sessions.
  chat_send_message: 600000,
  chat_continue_generation: 600000,
};

const RETRYABLE_COMMANDS = new Set([
  'auth_refresh_token',
  'get_onboarding_status',
  'analytics_get_session_id',
  'analytics_flush_events',
  'mcp_check_server_health',
]);

const RETRYABLE_ERROR_CODES = new Set(['TIMEOUT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']);

const buckets = new Map<string, number[]>();

const rateLimitLocks = new Map<string, Promise<void>>();

/**
 * Calculates the byte length of an object when serialized to JSON.
 * Used to enforce payload size limits on IPC calls.
 *
 * @param obj - The object to measure
 * @returns The byte length of the JSON-serialized object
 * @throws Error if the object cannot be serialized to JSON
 */
function byteLength(obj: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch (error) {
    throw new Error(
      `Failed to serialize payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Wraps a promise with a timeout, rejecting if the operation takes too long.
 * Useful for preventing hung IPC calls from blocking the UI indefinitely.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param operation - Name of the operation for error messages
 * @returns The resolved value of the original promise
 * @throws CodedError with code 'TIMEOUT' if the operation exceeds the timeout
 *
 * @example
 * const result = await withTimeout(fetchData(), 5000, 'fetchData');
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        createCodedError(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT'),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

export function validateResponse<T>(
  response: unknown,
  validator: (value: unknown) => value is T,
  command: string,
): T {
  if (!validator(response)) {
    throw createCodedError(
      `Invalid response from '${command}': expected valid structure but got ${JSON.stringify(response)?.substring(0, 100)}`,
      'INVALID_RESPONSE',
    );
  }
  return response;
}

export const TypeGuards = {
  isObject: (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  },

  isString: (value: unknown): value is string => {
    return typeof value === 'string';
  },

  isNumber: (value: unknown): value is number => {
    return typeof value === 'number' && !isNaN(value);
  },

  isBoolean: (value: unknown): value is boolean => {
    return typeof value === 'boolean';
  },

  isArray: (value: unknown): value is unknown[] => {
    return Array.isArray(value);
  },

  hasProperty: <T extends string>(value: unknown, prop: T): value is Record<T, unknown> => {
    return TypeGuards.isObject(value) && prop in value;
  },

  hasProperties: <T extends string>(value: unknown, props: T[]): value is Record<T, unknown> => {
    return TypeGuards.isObject(value) && props.every((prop) => prop in value);
  },
};

/**
 * Type guard to check if an error has a code property.
 */
function isCodedError(error: unknown): error is CodedError {
  return (
    error instanceof Error && 'code' in error && typeof (error as CodedError).code === 'string'
  );
}

function isRetryableError(error: unknown): boolean {
  if (isCodedError(error)) {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('unavailable')
    );
  }
  return false;
}

async function withRetry<T>(
  operation: () => Promise<T>,
  command: string,
  maxRetries: number = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !RETRYABLE_COMMANDS.has(command) || !isRetryableError(error)) {
        throw error;
      }

      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);

      if (import.meta.env.DEV) {
        console.warn(
          `[IPC] Retry ${attempt + 1}/${maxRetries} for '${command}' after ${delay}ms. Error:`,
          error,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Enforces rate limiting for IPC commands using a sliding window algorithm.
 * Prevents excessive calls to the same command within a time window.
 *
 * @param key - The command name or key to rate limit
 * @throws CodedError with code 'RATE_LIMIT' if the rate limit is exceeded
 *
 * @example
 * await rateLimit('auth_login');
 * // Proceeds if under limit, throws if exceeded
 */
async function rateLimit(key: string): Promise<void> {
  // Wait for any existing lock on this key to be released
  while (rateLimitLocks.has(key)) {
    await rateLimitLocks.get(key);
  }

  // HKS-002 fix: Initialize resolveLock with a no-op to ensure it's always defined
  // This prevents potential deadlocks if an error occurs during lock setup
  let resolveLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });

  // AUDIT-007-020 fix: Set the lock and immediately wrap in try/finally
  // to guarantee lock release even if any subsequent operation fails
  rateLimitLocks.set(key, lockPromise);

  try {
    const now = Date.now();
    const arr = buckets.get(key) ?? [];
    const pruned = arr.filter((t) => now - t < WINDOW_MS);

    if (pruned.length >= MAX_REQS_PER_WINDOW) {
      const retry = WINDOW_MS - (now - (pruned[0] ?? now));
      throw createCodedError(`Rate limit exceeded for ${key}. Retry in ${retry}ms`, 'RATE_LIMIT');
    }

    pruned.push(now);
    buckets.set(key, pruned);
  } finally {
    // HKS-002 + AUDIT-007-020 fix: Always delete lock first, then resolve
    // This ensures cleanup happens even if any operation throws
    // The lock MUST be released to prevent deadlock on subsequent calls
    rateLimitLocks.delete(key);
    resolveLock();
  }
}

/**
 * Invokes a Tauri backend command with automatic rate limiting, timeout, and retry handling.
 * This is the primary way to communicate between the React frontend and Rust backend.
 *
 * @param command - The Tauri command name to invoke
 * @param args - Optional JSON-serializable arguments to pass to the command
 * @returns The response from the Tauri command
 * @throws CodedError with code 'PAYLOAD_TOO_LARGE' if args exceed 256KB
 * @throws CodedError with code 'RATE_LIMIT' if too many calls to the same command
 * @throws CodedError with code 'TIMEOUT' if the command exceeds its timeout
 *
 * @example
 * const status = await invoke<OnboardingStatus>('get_onboarding_status');
 * await invoke('file_write', { path: '/tmp/test.txt', content: 'Hello' });
 */
export async function invoke<T = unknown>(command: string, args?: Json): Promise<T> {
  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Invalid command name');
  }
  assertAllowedCommandName(command);

  const size = byteLength(args);
  if (size > MAX_PAYLOAD_BYTES) {
    throw createCodedError(
      `Payload too large: ${size} bytes (max ${MAX_PAYLOAD_BYTES})`,
      'PAYLOAD_TOO_LARGE',
    );
  }

  return withRetry(async () => {
    await rateLimit(command);

    const timeout = COMMAND_TIMEOUTS[command] ?? DEFAULT_TIMEOUT_MS;

    const invokeArgs =
      args === null || typeof args !== 'object' || Array.isArray(args) ? undefined : args;
    return withTimeout(tauriInvoke<T>(command, invokeArgs), timeout, command);
  }, command);
}

/**
 * Event Trigger Types
 *
 * Types for the event-triggered agents system. Defines the contract for
 * automated agent execution driven by external events — cron schedules,
 * inbound webhooks, Slack messages, GitHub events, Linear updates, and
 * local file-system changes.
 *
 * All surfaces (desktop, web, mobile, CLI) can read trigger definitions
 * and execution history. The desktop app is the primary execution engine.
 *
 * @module event-triggers
 * @packageDocumentation
 */

// ============================================================================
// Trigger Type
// ============================================================================

/**
 * Discriminant used in `EventTriggerDefinition.type` and each
 * `TriggerConfig` variant to identify the trigger source.
 */
export type TriggerType = 'cron' | 'webhook' | 'slack' | 'github' | 'linear' | 'file_watcher';

// ============================================================================
// Trigger Config Variants
// ============================================================================

/**
 * Cron-based recurring trigger.
 *
 * Uses standard 5-field (or 6-field with seconds) cron syntax.
 *
 * @example
 * ```typescript
 * const config: CronTriggerConfig = {
 *   type: 'cron',
 *   expression: '0 9 * * 1-5',
 *   timezone: 'America/New_York',
 * };
 * ```
 */
export interface CronTriggerConfig {
  type: 'cron';

  /** Cron expression (e.g., `"0 9 * * 1-5"` for weekdays at 9 AM). */
  expression: string;

  /** IANA timezone identifier. Defaults to UTC when omitted. */
  timezone?: string;
}

/**
 * HTTP webhook trigger. The platform exposes an endpoint at the given
 * path; incoming requests fire the associated action.
 *
 * @example
 * ```typescript
 * const config: WebhookTriggerConfig = {
 *   type: 'webhook',
 *   path: '/hooks/my-trigger',
 *   method: 'POST',
 *   authToken: 'secret-abc',
 * };
 * ```
 */
export interface WebhookTriggerConfig {
  type: 'webhook';

  /** URL path relative to the webhook base (e.g., `"/hooks/my-trigger"`). */
  path: string;

  /** Accepted HTTP method. */
  method: 'GET' | 'POST';

  /** Bearer token for request authentication. Omit to allow unauthenticated. */
  authToken?: string;
}

/**
 * Slack event trigger. Listens to events from a specific Slack channel.
 *
 * @example
 * ```typescript
 * const config: SlackTriggerConfig = {
 *   type: 'slack',
 *   channelId: 'C01234567',
 *   eventTypes: ['message', 'app_mention'],
 * };
 * ```
 */
export interface SlackTriggerConfig {
  type: 'slack';

  /** Slack channel ID (not the display name). */
  channelId: string;

  /** Slack event type names to subscribe to (e.g., `"message"`, `"app_mention"`). */
  eventTypes: string[];
}

/**
 * GitHub event trigger. Fires on matching webhook events from a repository.
 *
 * @example
 * ```typescript
 * const config: GitHubTriggerConfig = {
 *   type: 'github',
 *   repo: 'acme/backend',
 *   events: ['pull_request', 'push'],
 *   filter: { ref: 'refs/heads/main' },
 * };
 * ```
 */
export interface GitHubTriggerConfig {
  type: 'github';

  /** Repository in `owner/repo` format. */
  repo: string;

  /** GitHub webhook event names (e.g., `"push"`, `"pull_request"`). */
  events: string[];

  /** Optional payload filter applied before the action fires. */
  filter?: Record<string, unknown>;
}

/**
 * Linear issue-tracker event trigger.
 *
 * @example
 * ```typescript
 * const config: LinearTriggerConfig = {
 *   type: 'linear',
 *   teamId: 'TEAM_abc',
 *   events: ['Issue.created', 'Issue.statusChanged'],
 * };
 * ```
 */
export interface LinearTriggerConfig {
  type: 'linear';

  /** Linear team identifier. */
  teamId: string;

  /** Linear webhook action names (e.g., `"Issue.created"`). */
  events: string[];
}

/**
 * Local file-system watcher trigger.
 *
 * Uses the operating system's native file-watch API to detect changes
 * inside a directory. Only available on the desktop surface.
 *
 * @example
 * ```typescript
 * const config: FileWatcherTriggerConfig = {
 *   type: 'file_watcher',
 *   watchPath: '/Users/alice/Documents/reports',
 *   glob: '**\/*.csv',
 *   debounceMs: 1000,
 * };
 * ```
 */
export interface FileWatcherTriggerConfig {
  type: 'file_watcher';

  /** Absolute path of the directory to watch. */
  watchPath: string;

  /** Glob pattern to restrict which file changes fire the trigger. */
  glob?: string;

  /** Debounce interval in milliseconds to coalesce rapid changes. Defaults to 500. */
  debounceMs?: number;
}

/**
 * Discriminated union of all trigger configuration shapes.
 *
 * Use the `type` field to narrow to a specific variant.
 */
export type TriggerConfig =
  | CronTriggerConfig
  | WebhookTriggerConfig
  | SlackTriggerConfig
  | GitHubTriggerConfig
  | LinearTriggerConfig
  | FileWatcherTriggerConfig;

// ============================================================================
// Trigger Action
// ============================================================================

/**
 * The action to execute when a trigger fires.
 *
 * Supports running an agent with a prompt, executing a workflow, or
 * sending a notification.
 */
export interface TriggerAction {
  /** Action type. */
  type: 'agent' | 'workflow' | 'notification';

  /** Prompt sent to the agent (required when type is `'agent'`). */
  prompt?: string;

  /** LLM model identifier for the agent (optional override). */
  model?: string;

  /** Workflow ID to execute (required when type is `'workflow'`). */
  workflowId?: string;

  /**
   * Whether the user must approve the action before it runs.
   *
   * When `true`, the platform sends an approval request to the mobile
   * companion or desktop notification centre before proceeding.
   */
  approvalRequired: boolean;
}

// ============================================================================
// Event Trigger Definition
// ============================================================================

/**
 * A persisted trigger definition that maps an event source to an action.
 *
 * @example
 * ```typescript
 * const trigger: EventTriggerDefinition = {
 *   id: 'trig-abc-123',
 *   name: 'Daily Standup Cron',
 *   type: 'cron',
 *   enabled: true,
 *   config: { type: 'cron', expression: '0 9 * * 1-5', timezone: 'America/New_York' },
 *   action: {
 *     type: 'agent',
 *     prompt: 'Summarize open pull requests and blockers',
 *     approvalRequired: false,
 *   },
 *   triggerCount: 42,
 *   createdAt: '2026-01-10T08:00:00Z',
 *   updatedAt: '2026-03-19T09:00:00Z',
 * };
 * ```
 */
export interface EventTriggerDefinition {
  /** Unique trigger identifier. */
  id: string;

  /** Human-readable trigger name. */
  name: string;

  /** Trigger source type (matches the `config.type` discriminant). */
  type: TriggerType;

  /** Whether the trigger is active. Disabled triggers never fire. */
  enabled: boolean;

  /** Source-specific configuration. */
  config: TriggerConfig;

  /** Action to execute when the trigger fires. */
  action: TriggerAction;

  /** ISO 8601 timestamp of the most recent successful trigger. Null if never fired. */
  lastTriggeredAt?: string;

  /** Cumulative number of times this trigger has fired. */
  triggerCount: number;

  /** ISO 8601 timestamp when the trigger was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the trigger was last modified. */
  updatedAt: string;
}

// ============================================================================
// Trigger Execution
// ============================================================================

/**
 * A single execution record produced when a trigger fires.
 *
 * Captures the full lifecycle of one trigger invocation so that users can
 * review history, debug failures, and monitor latency.
 *
 * @example
 * ```typescript
 * const execution: TriggerExecution = {
 *   id: 'texec-xyz-789',
 *   triggerId: 'trig-abc-123',
 *   status: 'completed',
 *   startedAt: '2026-03-19T09:00:00Z',
 *   completedAt: '2026-03-19T09:00:12Z',
 *   result: { summary: 'No open blockers today.' },
 * };
 * ```
 */
export interface TriggerExecution {
  /** Unique execution identifier. */
  id: string;

  /** The trigger that produced this execution. */
  triggerId: string;

  /** Current execution status. */
  status: 'running' | 'completed' | 'failed' | 'cancelled';

  /** ISO 8601 timestamp when execution began. */
  startedAt: string;

  /** ISO 8601 timestamp when execution ended. Null while running. */
  completedAt?: string;

  /** Execution result payload. Shape depends on the action type. */
  result?: unknown;

  /** Error message when status is `'failed'`. */
  error?: string;
}

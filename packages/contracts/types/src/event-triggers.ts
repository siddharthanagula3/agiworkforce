/**
 * Event Trigger Types
 *
 * Types for the event-triggered agents system. Defines the contract for
 * automated agent execution driven by external events, cron schedules,
 * inbound webhooks, Slack messages, GitHub events, Linear updates, and
 * local file-system changes.
 *
 * All surfaces (desktop, web, mobile, CLI) can read trigger definitions
 * and execution history. The desktop app is the primary execution engine.
 *
 * @module event-triggers
 * @packageDocumentation
 */

export type TriggerType = 'cron' | 'webhook' | 'slack' | 'github' | 'linear' | 'file_watcher';

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

  expression: string;

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

  path: string;

  method: 'GET' | 'POST';

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

  channelId: string;

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

  repo: string;

  events: string[];

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

  teamId: string;

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

  watchPath: string;

  glob?: string;

  debounceMs?: number;
}

export type TriggerConfig =
  | CronTriggerConfig
  | WebhookTriggerConfig
  | SlackTriggerConfig
  | GitHubTriggerConfig
  | LinearTriggerConfig
  | FileWatcherTriggerConfig;

export interface TriggerAction {
  type: 'agent' | 'workflow' | 'notification';

  prompt?: string;

  model?: string;

  workflowId?: string;

  approvalRequired: boolean;
}

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
  id: string;

  name: string;

  type: TriggerType;

  enabled: boolean;

  config: TriggerConfig;

  action: TriggerAction;

  lastTriggeredAt?: string;

  triggerCount: number;

  createdAt: string;

  updatedAt: string;
}

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
  id: string;

  triggerId: string;

  status: 'running' | 'completed' | 'failed' | 'cancelled';

  startedAt: string;

  completedAt?: string;

  result?: unknown;

  error?: string;
}

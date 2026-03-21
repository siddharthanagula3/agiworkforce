/**
 * Scheduler Types
 *
 * Types for the proactive task scheduling system. Supports cron-based
 * scheduling, one-time tasks, and natural language schedule parsing.
 *
 * Desktop is the execution engine; web and mobile surfaces display
 * schedules and allow management.
 *
 * @module scheduler
 * @packageDocumentation
 */

// ============================================================================
// Cron Expression
// ============================================================================

/**
 * A validated cron expression string.
 *
 * Standard 5-field cron format: `minute hour day-of-month month day-of-week`.
 * Extended 6-field format (with seconds) is also supported.
 *
 * @example
 * ```typescript
 * const daily: CronExpression = '0 9 * * *';      // Every day at 9:00 AM
 * const weekly: CronExpression = '0 10 * * 1';     // Every Monday at 10:00 AM
 * const hourly: CronExpression = '0 * * * *';      // Every hour on the hour
 * ```
 */
export type CronExpression = string;

// ============================================================================
// Schedule Config
// ============================================================================

/**
 * Configuration for a scheduled task's timing.
 *
 * Supports cron-based recurring schedules, one-time execution,
 * and interval-based repetition.
 *
 * @example
 * ```typescript
 * // Recurring daily report
 * const config: ScheduleConfig = {
 *   type: 'cron',
 *   cron: '0 9 * * *',
 *   timezone: 'America/New_York',
 *   enabled: true,
 * };
 *
 * // One-time reminder
 * const oneTime: ScheduleConfig = {
 *   type: 'once',
 *   executeAt: '2026-03-20T14:00:00Z',
 *   enabled: true,
 * };
 * ```
 */
export interface ScheduleConfig {
  /** Schedule type. */
  type: 'cron' | 'once' | 'interval';

  /** Cron expression (required when type is `'cron'`). */
  cron?: CronExpression;

  /** ISO 8601 timestamp for one-time execution (required when type is `'once'`). */
  executeAt?: string;

  /** Interval in milliseconds (required when type is `'interval'`). */
  intervalMs?: number;

  /** IANA timezone identifier (e.g., `"America/New_York"`). */
  timezone?: string;

  /** Whether the schedule is active. */
  enabled: boolean;

  /** ISO 8601 timestamp after which the schedule stops (optional). */
  expiresAt?: string;

  /** Maximum number of executions (optional, 0 = unlimited). */
  maxExecutions?: number;
}

// ============================================================================
// Scheduled Task
// ============================================================================

/**
 * A task that is scheduled for future or recurring execution.
 *
 * @example
 * ```typescript
 * const task: ScheduledTask = {
 *   id: 'sched-abc-123',
 *   name: 'Daily Standup Summary',
 *   description: 'Generate a summary of yesterday work items',
 *   schedule: {
 *     type: 'cron',
 *     cron: '0 9 * * 1-5',
 *     timezone: 'America/New_York',
 *     enabled: true,
 *   },
 *   action: {
 *     type: 'agent',
 *     agentConfig: { name: 'Standup Bot', model: 'claude-sonnet-4-5', provider: 'anthropic' },
 *     prompt: 'Summarize work items from the last 24 hours',
 *   },
 *   status: 'active',
 *   executionCount: 15,
 *   lastExecutedAt: '2026-03-14T09:00:00Z',
 *   nextExecutionAt: '2026-03-17T09:00:00Z',
 *   createdAt: '2026-02-01T00:00:00Z',
 *   updatedAt: '2026-03-14T09:00:05Z',
 * };
 * ```
 */
export interface ScheduledTask {
  /** Unique task identifier. */
  id: string;

  /** Human-readable task name. */
  name: string;

  /** Optional task description. */
  description?: string;

  /** Schedule configuration. */
  schedule: ScheduleConfig;

  /** Action to perform when the schedule triggers. */
  action: ScheduledAction;

  /** Current task status. */
  status: 'active' | 'paused' | 'completed' | 'failed' | 'expired';

  /** Number of times this task has been executed. */
  executionCount: number;

  /** ISO 8601 timestamp of the last execution. Null if never executed. */
  lastExecutedAt?: string | null;

  /** ISO 8601 timestamp of the next scheduled execution. Null if completed/paused. */
  nextExecutionAt?: string | null;

  /** @deprecated Use `lastExecutedAt`. Kept for compatibility with legacy desktop payloads. */
  lastRun?: string | null;

  /** @deprecated Use `nextExecutionAt`. Kept for compatibility with legacy desktop payloads. */
  nextRun?: string | null;

  /** Error message from the last failed execution. */
  lastError?: string;

  /** ISO 8601 timestamp when the task was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the task was last updated. */
  updatedAt: string;

  /** User who owns this scheduled task. */
  userId?: string;
}

// ============================================================================
// Scheduled Action
// ============================================================================

/**
 * The action to perform when a scheduled task triggers.
 *
 * Supports agent execution, workflow execution, and simple notifications.
 */
export interface ScheduledAction {
  /** Action type. */
  type: 'agent' | 'workflow' | 'notification' | 'command';

  /** Agent configuration (when type is `'agent'`). */
  agentConfig?: {
    name: string;
    model: string;
    provider: string;
  };

  /** Prompt to send to the agent (when type is `'agent'`). */
  prompt?: string;

  /** Workflow ID to execute (when type is `'workflow'`). */
  workflowId?: string;

  /** Notification message (when type is `'notification'`). */
  message?: string;

  /** Shell command to run (when type is `'command'`). */
  command?: string;

  /** Arbitrary action metadata. */
  metadata?: Record<string, unknown>;
}

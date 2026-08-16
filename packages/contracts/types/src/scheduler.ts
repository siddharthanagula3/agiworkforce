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
  type: 'cron' | 'once' | 'interval';

  cron?: CronExpression;

  executeAt?: string;

  intervalMs?: number;

  timezone?: string;

  enabled: boolean;

  expiresAt?: string;

  maxExecutions?: number;
}

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
 *     agentConfig: {
 *       name: 'Standup Bot',
 *       model: selectedModel.id,
 *       provider: selectedModel.provider,
 *     },
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
  id: string;

  name: string;

  description?: string;

  schedule: ScheduleConfig;

  action: ScheduledAction;

  status: 'active' | 'paused' | 'completed' | 'failed' | 'expired';

  executionCount: number;

  lastExecutedAt?: string | null;

  nextExecutionAt?: string | null;

  /** @deprecated Use `lastExecutedAt`. Kept for compatibility with legacy desktop payloads. */
  lastRun?: string | null;

  /** @deprecated Use `nextExecutionAt`. Kept for compatibility with legacy desktop payloads. */
  nextRun?: string | null;

  lastError?: string;

  createdAt: string;

  updatedAt: string;

  userId?: string;
}

export interface ScheduledAction {
  type: 'agent' | 'workflow' | 'notification' | 'command';

  agentConfig?: {
    name: string;
    model: string;
    provider: string;
  };

  prompt?: string;

  workflowId?: string;

  message?: string;

  command?: string;

  metadata?: Record<string, unknown>;
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import {
  getBillingPlanPricing,
  getModelMetadataById,
  getPlanMaxScheduledTasks,
  isAutoModeModelId,
} from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  createClaimedUserScopedDb,
  type ClaimedUserScope,
} from '@/lib/server/claimed-user-scope-db';
import { logger } from '@/lib/logger';
import { withSpan } from '@/lib/observability/span';
import {
  assertDeliverableCadence,
  buildCronExpression,
  getNextExecutionAt,
  validateTimeZone,
  type ProductRecurrence,
  type ScheduleTiming,
} from '@/lib/schedules/schedule-time';
import { executeScheduledAgent } from './scheduled-agent-executor';
import { notifyScheduleCompleted } from './schedule-notification-service';

const DEFAULT_LEASE_SECONDS = 45;
const MAX_BATCH_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_ERROR_LENGTH = 2_000;

export type ScheduleRunStatus = ManagedCloudScheduleRun['status'];
export type ScheduleTriggerSource = ManagedCloudScheduleRun['triggerSource'];

export class ScheduleNotFoundError extends Error {
  constructor(message = 'Schedule not found') {
    super(message);
    this.name = 'ScheduleNotFoundError';
  }
}

export class ScheduleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleConflictError';
  }
}

export class ScheduleLimitError extends Error {
  constructor(
    message: string,
    readonly planTier: string,
    readonly limit: number,
  ) {
    super(message);
    this.name = 'ScheduleLimitError';
  }
}

export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleValidationError';
  }
}

export interface ScheduleInput {
  name: string;
  description?: string | null;
  prompt: string;
  model?: string | null;
  recurrence: ProductRecurrence;
  cronExpression?: string | null;
  scheduledAt?: string | null;
  intervalMs?: number | null;
  timeOfDay?: string;
  daysOfWeek?: readonly number[];
  dayOfMonth?: number | null;
  timezone: string;
  isActive?: boolean;
  expiresAt?: string | null;
  maxExecutions?: number | null;
  notificationSettings?: unknown;
  projectId?: string | null;
}

export type ScheduleUpdateInput = Partial<ScheduleInput>;

export type ScheduleTask = ManagedCloudScheduleTask;
export type ScheduleRun = ManagedCloudScheduleRun;

export interface ClaimedScheduleRun {
  runId: string;
  scheduledFor: string;
  triggerSource?: ScheduleTriggerSource;
  startedAt?: string;
  scope: ClaimedUserScope;
  task: ScheduleTask;
}

export interface ScheduledExecutionResult {
  text: string;
  model: string;
  provider?: string;
  toolsUsed?: string[];
  usage?: Record<string, unknown>;
  billingStatus?: string;
}

export type ScheduledTaskExecutor = (
  task: ScheduleTask,
  signal: AbortSignal,
  runId: string,
  scope: ClaimedUserScope & { db: DatabaseAdapter },
) => Promise<ScheduledExecutionResult>;

interface TaskRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  organization_id: string | null;
  project_id: string | null;
  name: string;
  description: string | null;
  schedule_type: string;
  cron_expression: string | null;
  execute_at: string | null;
  interval_ms: number | string | null;
  timezone: string;
  is_enabled: boolean;
  expires_at: string | null;
  max_executions: number | null;
  execution_count: number;
  action_type: string;
  action_config: Record<string, unknown> | null;
  prompt: string | null;
  model: string | null;
  status: string;
  last_executed_at: string | null;
  next_execution_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface RunRow extends Record<string, unknown> {
  id: string;
  task_id: string;
  status: string;
  trigger_source: string;
  scheduled_for: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  idempotency_key: string;
  lease_expires_at: string | null;
  attempt_count: number;
}

type ClaimRow = TaskRow & {
  run_id: string;
  run_started_at: string;
  scheduled_for: string;
  trigger_source: ScheduleTriggerSource;
};

function asTaskStatus(value: string): ScheduleTask['status'] {
  if (['active', 'paused', 'completed', 'failed', 'expired'].includes(value)) {
    return value as ScheduleTask['status'];
  }
  throw new Error(`Invalid scheduled task status: ${value}`);
}

function asRunStatus(value: string): ScheduleRunStatus {
  if (['running', 'success', 'failed', 'timeout', 'cancelled'].includes(value)) {
    return value as ScheduleRunStatus;
  }
  throw new Error(`Invalid schedule run status: ${value}`);
}

function asTriggerSource(value: string): ScheduleTriggerSource {
  if (['schedule', 'manual', 'webhook', 'api'].includes(value)) {
    return value as ScheduleTriggerSource;
  }
  throw new Error(`Invalid schedule trigger source: ${value}`);
}

export function mapScheduleTask(row: TaskRow): ScheduleTask {
  const scheduleType = row.schedule_type;
  const actionType = row.action_type;
  if (!['cron', 'once', 'interval'].includes(scheduleType)) {
    throw new Error(`Invalid schedule type: ${scheduleType}`);
  }
  if (!['agent', 'workflow', 'notification', 'command'].includes(actionType)) {
    throw new Error(`Invalid scheduled action type: ${actionType}`);
  }
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    scheduleType: scheduleType as ScheduleTask['scheduleType'],
    cronExpression: row.cron_expression,
    executeAt: row.execute_at,
    intervalMs: row.interval_ms === null ? null : Number(row.interval_ms),
    timezone: row.timezone,
    isEnabled: row.is_enabled,
    expiresAt: row.expires_at,
    maxExecutions: row.max_executions,
    executionCount: row.execution_count,
    actionType: actionType as ScheduleTask['actionType'],
    actionConfig: row.action_config,
    prompt: row.prompt,
    model: row.model,
    status: asTaskStatus(row.status),
    lastExecutedAt: row.last_executed_at,
    nextExecutionAt: row.next_execution_at,
    lastError: row.last_error,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapScheduleRun(row: RunRow): ScheduleRun {
  return {
    id: row.id,
    taskId: row.task_id,
    status: asRunStatus(row.status),
    triggerSource: asTriggerSource(row.trigger_source),
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    result: row.result,
    error: row.error,
    idempotencyKey: row.idempotency_key,
    leaseExpiresAt: row.lease_expires_at,
    attemptCount: row.attempt_count,
  };
}

function mapClaim(row: ClaimRow): ClaimedScheduleRun {
  return {
    runId: row.run_id,
    scheduledFor: row.scheduled_for,
    triggerSource: row.trigger_source,
    startedAt: row.run_started_at,
    scope: { userId: row.user_id, organizationId: row.organization_id ?? null },
    task: mapScheduleTask(row),
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function validation<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof ScheduleValidationError) throw error;
    throw new ScheduleValidationError(error instanceof Error ? error.message : String(error));
  }
}

function validDate(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new ScheduleValidationError(`${label} must be a string timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ScheduleValidationError(`${label} is invalid`);
  return date;
}

function normalizeModel(model: string | null | undefined): string {
  const selection = model?.trim() || 'auto';
  if (isAutoModeModelId(selection)) return selection;
  const metadata = getModelMetadataById(selection);
  if (!metadata) throw new ScheduleValidationError('Model is not present in the canonical catalog');
  return metadata.id;
}

interface ValidatedScheduleDefinition {
  name: string;
  description: string | null;
  prompt: string;
  model: string;
  projectId: string | null;
  scheduleType: ScheduleTask['scheduleType'];
  cronExpression: string | null;
  executeAt: string | null;
  intervalMs: number | null;
  timezone: string;
  isEnabled: boolean;
  expiresAt: string | null;
  maxExecutions: number | null;
  nextExecutionAt: string | null;
  status: ScheduleTask['status'];
  metadata: Record<string, unknown>;
}

const SCHEDULE_INPUT_KEYS = new Set([
  'name',
  'description',
  'prompt',
  'model',
  'recurrence',
  'cronExpression',
  'scheduledAt',
  'intervalMs',
  'timeOfDay',
  'daysOfWeek',
  'dayOfMonth',
  'timezone',
  'isActive',
  'expiresAt',
  'maxExecutions',
  'notificationSettings',
  'projectId',
]);

function validateScheduleInput(
  input: ScheduleInput,
  now: Date,
  options: { enforceCadence?: boolean } = {},
): ValidatedScheduleDefinition {
  const enforceCadence = options.enforceCadence ?? true;
  return validation(() => {
    const unknownKeys = Object.keys(input).filter((key) => !SCHEDULE_INPUT_KEYS.has(key));
    if (unknownKeys.length > 0) {
      throw new ScheduleValidationError(`Unknown schedule field: ${unknownKeys.join(', ')}`);
    }
    const name = input.name?.trim();
    const prompt = input.prompt?.trim();
    if (!name) throw new ScheduleValidationError('Name is required');
    if (name.length > 500) throw new ScheduleValidationError('Name must be 500 characters or less');
    if (!prompt) throw new ScheduleValidationError('Prompt is required');
    if (prompt.length > 10_000) {
      throw new ScheduleValidationError('Prompt must be 10,000 characters or less');
    }
    const description = input.description?.trim() || null;
    if (description && description.length > 2_000) {
      throw new ScheduleValidationError('Description must be 2,000 characters or less');
    }
    const projectId = input.projectId?.trim() || null;
    if (input.notificationSettings !== undefined) {
      throw new ScheduleValidationError('Schedule notifications are not available yet');
    }
    if (input.isActive !== undefined && typeof input.isActive !== 'boolean') {
      throw new ScheduleValidationError('isActive must be a boolean');
    }
    if (
      !['once', 'daily', 'weekly', 'monthly', 'custom', 'interval'].includes(
        String(input.recurrence),
      )
    ) {
      throw new ScheduleValidationError('recurrence is invalid');
    }

    const timezone = validateTimeZone(input.timezone);
    const expiresAt = validDate(input.expiresAt, 'expiresAt');
    if (expiresAt && expiresAt <= now) {
      throw new ScheduleValidationError('expiresAt must be in the future');
    }
    const maxExecutions = input.maxExecutions ?? null;
    if (
      maxExecutions !== null &&
      (!Number.isInteger(maxExecutions) || maxExecutions < 1 || maxExecutions > 1_000_000)
    ) {
      throw new ScheduleValidationError('maxExecutions must be an integer from 1 to 1,000,000');
    }

    let scheduleType: ScheduleTask['scheduleType'];
    let cronExpression: string | null = null;
    let executeAt: string | null = null;
    let intervalMs: number | null = null;
    let timing: ScheduleTiming;
    if (input.recurrence === 'once') {
      scheduleType = 'once';
      const date = validDate(input.scheduledAt, 'scheduledAt');
      if (!date) throw new ScheduleValidationError('scheduledAt is required for a one-time task');
      executeAt = date.toISOString();
      timing = { scheduleType, executeAt, timezone };
    } else if (input.recurrence === 'interval') {
      scheduleType = 'interval';
      intervalMs = input.intervalMs ?? null;
      timing = { scheduleType, intervalMs, timezone };
    } else {
      scheduleType = 'cron';
      cronExpression = buildCronExpression({
        recurrence: input.recurrence,
        timeOfDay: input.timeOfDay,
        daysOfWeek: input.daysOfWeek,
        dayOfMonth: input.dayOfMonth,
        cronExpression: input.cronExpression,
      });
      timing = { scheduleType, cronExpression, timezone };
    }

    if (enforceCadence) assertDeliverableCadence(timing, now);

    const isEnabled = input.isActive !== false;
    const firstExecutionAt = getNextExecutionAt(timing, now, now);
    if (expiresAt && firstExecutionAt >= expiresAt) {
      throw new ScheduleValidationError('Schedule expiration must be after its first occurrence');
    }
    const nextExecutionAt = isEnabled ? firstExecutionAt.toISOString() : null;
    return {
      name,
      description,
      prompt,
      model: normalizeModel(input.model),
      projectId,
      scheduleType,
      cronExpression,
      executeAt,
      intervalMs,
      timezone,
      isEnabled,
      expiresAt: expiresAt?.toISOString() ?? null,
      maxExecutions,
      nextExecutionAt,
      status: isEnabled ? 'active' : 'paused',
      metadata: {
        productRecurrence: input.recurrence,
        ...(input.timeOfDay ? { timeOfDay: input.timeOfDay } : {}),
        ...(input.daysOfWeek ? { daysOfWeek: [...input.daysOfWeek] } : {}),
        ...(input.dayOfMonth ? { dayOfMonth: input.dayOfMonth } : {}),
      },
    };
  });
}

export async function countSchedules(db: DatabaseAdapter, userId: string): Promise<number> {
  const [row] = await db.query<{ count: string }>(
    `select count(*)::text as count from scheduled_tasks where user_id = $1`,
    [userId],
  );
  const parsed = Number.parseInt(row?.count ?? '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function assertScheduleQuota(
  db: DatabaseAdapter,
  userId: string,
  planTier: string | null | undefined,
): Promise<void> {
  const limit = getPlanMaxScheduledTasks(planTier);
  if (limit === null) return;

  const label = getBillingPlanPricing(planTier).label;

  if (limit <= 0) {
    throw new ScheduleLimitError(
      `${label} plans do not include scheduled tasks. Upgrade to schedule unattended runs.`,
      planTier ?? 'unknown',
      0,
    );
  }

  const existing = await countSchedules(db, userId);
  if (existing >= limit) {
    throw new ScheduleLimitError(
      `${label} plans can have up to ${limit} scheduled ${limit === 1 ? 'task' : 'tasks'}. Delete one or upgrade to add another.`,
      planTier ?? 'unknown',
      limit,
    );
  }
}

export async function assertProjectOwnership(
  db: DatabaseAdapter,
  userId: string,
  projectId: string,
): Promise<void> {
  const [row] = await db.query<{ id: string }>(
    `select id from user_projects where id = $1 and user_id = $2 and deleted_at is null limit 1`,
    [projectId, userId],
  );
  if (!row) {
    throw new ScheduleValidationError('Project not found or not owned by this account');
  }
}

export async function listSchedules(
  db: DatabaseAdapter,
  userId: string,
  page: { limit: number; offset: number; projectId?: string | null },
): Promise<ScheduleTask[]> {
  const rows = page.projectId
    ? await db.query<TaskRow>(
        `select * from scheduled_tasks
         where user_id = $1 and project_id = $2
         order by created_at desc, id desc
         limit $3 offset $4`,
        [
          userId,
          page.projectId,
          clampInteger(page.limit, 1, MAX_PAGE_SIZE),
          clampInteger(page.offset, 0, 10_000),
        ],
      )
    : await db.query<TaskRow>(
        `select * from scheduled_tasks
         where user_id = $1
         order by created_at desc, id desc
         limit $2 offset $3`,
        [userId, clampInteger(page.limit, 1, MAX_PAGE_SIZE), clampInteger(page.offset, 0, 10_000)],
      );
  return rows.map(mapScheduleTask);
}

export async function getSchedule(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
): Promise<ScheduleTask> {
  const [row] = await db.query<TaskRow>(
    `select * from scheduled_tasks where id = $1 and user_id = $2 limit 1`,
    [taskId, userId],
  );
  if (!row) throw new ScheduleNotFoundError();
  return mapScheduleTask(row);
}

async function getScheduleForUpdate(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
): Promise<ScheduleTask> {
  const [row] = await db.query<TaskRow>(
    `select * from scheduled_tasks
     where id = $1 and user_id = $2
     for update`,
    [taskId, userId],
  );
  if (!row) throw new ScheduleNotFoundError();
  return mapScheduleTask(row);
}

export async function createSchedule(
  db: DatabaseAdapter,
  userId: string,
  input: ScheduleInput,
  options: { now?: Date } = {},
): Promise<ScheduleTask> {
  const definition = validateScheduleInput(input, options.now ?? new Date());
  if (definition.projectId) await assertProjectOwnership(db, userId, definition.projectId);
  const [row] = await db.query<TaskRow>(
    `insert into scheduled_tasks (
       user_id, name, description, schedule_type, cron_expression, execute_at,
       interval_ms, timezone, is_enabled, expires_at, max_executions,
       action_type, action_config, prompt, model, status, next_execution_at, metadata,
       project_id
     ) values (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11,
       'agent', null, $12, $13, $14, $15, $16::jsonb,
       $17
     ) returning *`,
    [
      userId,
      definition.name,
      definition.description,
      definition.scheduleType,
      definition.cronExpression,
      definition.executeAt,
      definition.intervalMs,
      definition.timezone,
      definition.isEnabled,
      definition.expiresAt,
      definition.maxExecutions,
      definition.prompt,
      definition.model,
      definition.status,
      definition.nextExecutionAt,
      JSON.stringify(definition.metadata),
      definition.projectId,
    ],
  );
  if (!row) throw new Error('Schedule insert returned no row');
  return mapScheduleTask(row);
}

function recurrenceFromTask(task: ScheduleTask): ProductRecurrence {
  const stored = task.metadata?.['productRecurrence'];
  if (['once', 'daily', 'weekly', 'monthly', 'custom', 'interval'].includes(String(stored))) {
    return stored as ProductRecurrence;
  }
  return task.scheduleType === 'cron' ? 'custom' : task.scheduleType;
}

function inputFromTask(task: ScheduleTask): ScheduleInput {
  return {
    name: task.name,
    description: task.description,
    prompt: task.prompt ?? '',
    model: task.model,
    recurrence: recurrenceFromTask(task),
    cronExpression: task.cronExpression,
    scheduledAt: task.executeAt,
    intervalMs: task.intervalMs,
    timeOfDay:
      typeof task.metadata?.['timeOfDay'] === 'string'
        ? (task.metadata['timeOfDay'] as string)
        : undefined,
    daysOfWeek: Array.isArray(task.metadata?.['daysOfWeek'])
      ? (task.metadata['daysOfWeek'] as number[])
      : undefined,
    dayOfMonth:
      typeof task.metadata?.['dayOfMonth'] === 'number'
        ? (task.metadata['dayOfMonth'] as number)
        : undefined,
    timezone: task.timezone,
    isActive: task.isEnabled,
    expiresAt: task.expiresAt,
    maxExecutions: task.maxExecutions,
    projectId: task.projectId ?? null,
  };
}

export async function updateSchedule(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
  patch: ScheduleUpdateInput,
  options: { now?: Date } = {},
): Promise<ScheduleTask> {
  return db.transaction(async (tx) => {
    const current = await getScheduleForUpdate(tx, userId, taskId);
    if (current.status === 'completed' || current.status === 'expired') {
      throw new ScheduleConflictError('A terminal schedule cannot be edited');
    }
    const validationNow = options.now ?? new Date();
    const definition = validateScheduleInput(
      { ...inputFromTask(current), ...patch } as ScheduleInput,
      validationNow,
      { enforceCadence: false },
    );
    const timingChanged =
      definition.scheduleType !== current.scheduleType ||
      definition.cronExpression !== current.cronExpression ||
      definition.executeAt !== current.executeAt ||
      definition.intervalMs !== current.intervalMs ||
      definition.timezone !== current.timezone;
    if (timingChanged) {
      assertDeliverableCadence(
        {
          scheduleType: definition.scheduleType,
          cronExpression: definition.cronExpression,
          executeAt: definition.executeAt,
          intervalMs: definition.intervalMs,
          timezone: definition.timezone,
        },
        validationNow,
      );
    }
    const activationChanged =
      Object.hasOwn(patch, 'isActive') && patch.isActive !== current.isEnabled;
    if (!timingChanged && !activationChanged) {
      definition.nextExecutionAt = current.nextExecutionAt;
      if (
        definition.expiresAt &&
        definition.nextExecutionAt &&
        new Date(definition.nextExecutionAt) >= new Date(definition.expiresAt)
      ) {
        throw new ScheduleValidationError('Schedule expiration must be after its next occurrence');
      }
    }
    if (definition.projectId && definition.projectId !== (current.projectId ?? null)) {
      await assertProjectOwnership(tx, userId, definition.projectId);
    }

    const [row] = await tx.query<TaskRow>(
      `update scheduled_tasks
       set name = $3, description = $4, schedule_type = $5, cron_expression = $6,
           execute_at = $7, interval_ms = $8, timezone = $9, is_enabled = $10,
           expires_at = $11, max_executions = $12, prompt = $13, model = $14,
           status = $15, next_execution_at = $16, metadata = $17::jsonb,
           project_id = $18,
           last_error = null, updated_at = now()
       where id = $1 and user_id = $2
       returning *`,
      [
        taskId,
        userId,
        definition.name,
        definition.description,
        definition.scheduleType,
        definition.cronExpression,
        definition.executeAt,
        definition.intervalMs,
        definition.timezone,
        definition.isEnabled,
        definition.expiresAt,
        definition.maxExecutions,
        definition.prompt,
        definition.model,
        definition.status,
        definition.nextExecutionAt,
        JSON.stringify(definition.metadata),
        definition.projectId,
      ],
    );
    if (!row) throw new ScheduleNotFoundError();
    return mapScheduleTask(row);
  });
}

export async function setScheduleEnabled(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
  enabled: boolean,
  options: { now?: Date } = {},
): Promise<ScheduleTask> {
  return db.transaction(async (tx) => {
    const current = await getScheduleForUpdate(tx, userId, taskId);
    if (current.status === 'completed' || current.status === 'expired') {
      throw new ScheduleConflictError('A terminal schedule cannot be enabled');
    }
    const now = options.now ?? new Date();
    let nextExecutionAt: string | null = null;
    if (enabled) {
      if (current.maxExecutions !== null && current.executionCount >= current.maxExecutions) {
        throw new ScheduleConflictError('Schedule has reached its execution limit');
      }
      const expiresAt = current.expiresAt ? new Date(current.expiresAt) : null;
      if (expiresAt && expiresAt <= now) {
        throw new ScheduleConflictError('Schedule has expired');
      }
      nextExecutionAt = validation(() =>
        getNextExecutionAt(scheduleTiming(current), now, now).toISOString(),
      );
      if (expiresAt && new Date(nextExecutionAt) >= expiresAt) {
        throw new ScheduleConflictError('Schedule expiration is before its next occurrence');
      }
    }
    const [row] = await tx.query<TaskRow>(
      `update scheduled_tasks
       set is_enabled = $3, status = $4, next_execution_at = $5,
           last_error = null, updated_at = now()
       where id = $1 and user_id = $2
       returning *`,
      [taskId, userId, enabled, enabled ? 'active' : 'paused', nextExecutionAt],
    );
    if (!row) throw new ScheduleNotFoundError();
    return mapScheduleTask(row);
  });
}

export async function deleteSchedule(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await getScheduleForUpdate(tx, userId, taskId);
    const [running] = await tx.query<{ id: string }>(
      `select id from scheduled_task_runs
       where task_id = $1 and status = 'running'
       limit 1`,
      [taskId],
    );
    if (running) {
      throw new ScheduleConflictError('Schedule cannot be deleted while a run is in progress');
    }
    const affected = await tx.execute(
      `delete from scheduled_tasks where id = $1 and user_id = $2`,
      [taskId, userId],
    );
    if (affected !== 1) throw new ScheduleNotFoundError();
  });
}

export async function claimDueScheduleRuns(
  db: DatabaseAdapter,
  options: { limit: number; leaseSeconds?: number },
): Promise<ClaimedScheduleRun[]> {
  const limit = clampInteger(options.limit, 1, MAX_BATCH_SIZE);
  const leaseSeconds = clampInteger(options.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 5, 300);
  const rows = await db.query<ClaimRow>(
    `with expired_candidates as (
       select id from scheduled_tasks
       where status = 'active' and is_enabled = true
         and expires_at is not null and expires_at <= now()
       order by expires_at asc, id asc
       for update skip locked
       limit $1
     ), expired as (
       update scheduled_tasks as task
       set status = 'expired', is_enabled = false,
           next_execution_at = null, updated_at = now()
       from expired_candidates
       where task.id = expired_candidates.id
       returning task.id
     ), due as (
       select id, next_execution_at as scheduled_for
       from scheduled_tasks
       where is_enabled = true
         and status = 'active'
         and next_execution_at <= now()
         and (expires_at is null or expires_at > now())
         and (max_executions is null or execution_count < max_executions)
       order by next_execution_at asc, id asc
       for update skip locked
       limit $1
     ), claimed as (
       update scheduled_tasks as task
       set next_execution_at = null,
           last_executed_at = now(),
           execution_count = task.execution_count + 1,
           updated_at = now()
       from due
       where task.id = due.id
       returning task.*, due.scheduled_for
     ), inserted as (
       insert into scheduled_task_runs (
         task_id, status, trigger_source, scheduled_for, idempotency_key,
         lease_expires_at, attempt_count
       )
       select id, 'running', 'schedule', scheduled_for,
              'schedule:' || scheduled_for::text,
              now() + make_interval(secs => $2), 1
       from claimed
       on conflict (task_id, idempotency_key) do nothing
       returning id, task_id, trigger_source, started_at
     )
     select claimed.*, inserted.id as run_id,
            inserted.started_at as run_started_at,
            inserted.trigger_source
     from claimed
     join inserted on inserted.task_id = claimed.id
     order by claimed.scheduled_for asc, claimed.id asc`,
    [limit, leaseSeconds],
  );
  return rows.map(mapClaim);
}

export async function listScheduleRuns(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
  page: { limit: number; offset: number },
): Promise<ScheduleRun[]> {
  const limit = clampInteger(page.limit, 1, MAX_PAGE_SIZE);
  const offset = clampInteger(page.offset, 0, 10_000);
  const rows = await db.query<RunRow & { owner_task_id: string }>(
    `with owner as (
       select id from scheduled_tasks where id = $1 and user_id = $2
     ), paged_runs as (
       select run.*
       from scheduled_task_runs as run
       join owner on owner.id = run.task_id
       order by run.started_at desc, run.id desc
       limit $3 offset $4
     )
     select owner.id as owner_task_id, paged_runs.*
     from owner
     left join paged_runs on true`,
    [taskId, userId, limit, offset],
  );
  if (rows.length === 0) throw new ScheduleNotFoundError();
  return rows.filter((row) => Boolean(row.id)).map(mapScheduleRun);
}

function validateIdempotencyKey(key: string): void {
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new ScheduleValidationError('Idempotency-Key must be 8-128 URL-safe characters');
  }
}

export async function createManualScheduleRun(
  db: DatabaseAdapter,
  input: { userId: string; taskId: string; idempotencyKey: string; leaseSeconds?: number },
): Promise<{ claim: ClaimedScheduleRun; replay: boolean; run: ScheduleRun }> {
  validateIdempotencyKey(input.idempotencyKey);
  const leaseSeconds = clampInteger(input.leaseSeconds ?? DEFAULT_LEASE_SECONDS, 5, 300);

  return db.transaction(async (tx) => {
    const [taskRow] = await tx.query<TaskRow>(
      `select * from scheduled_tasks
       where id = $1 and user_id = $2
       for update`,
      [input.taskId, input.userId],
    );
    if (!taskRow) throw new ScheduleNotFoundError();
    const task = mapScheduleTask(taskRow);
    const idempotencyKey = `manual:${input.idempotencyKey}`;
    const [existingRun] = await tx.query<RunRow>(
      `select * from scheduled_task_runs
       where task_id = $1 and idempotency_key = $2
       limit 1`,
      [input.taskId, idempotencyKey],
    );
    if (existingRun) {
      const run = mapScheduleRun(existingRun);
      return {
        claim: {
          runId: run.id,
          scheduledFor: run.scheduledFor ?? run.startedAt,
          triggerSource: 'manual',
          startedAt: run.startedAt,
          scope: {
            userId: taskRow.user_id,
            organizationId: taskRow.organization_id ?? null,
          },
          task,
        },
        replay: true,
        run,
      };
    }
    if (!task.isEnabled || task.status !== 'active') {
      throw new ScheduleConflictError('Schedule is disabled or paused');
    }
    if (task.expiresAt && new Date(task.expiresAt) <= new Date()) {
      throw new ScheduleConflictError('Schedule has expired');
    }
    if (task.maxExecutions !== null && task.executionCount >= task.maxExecutions) {
      throw new ScheduleConflictError('Schedule has reached its execution limit');
    }

    const [runRow] = await tx.query<RunRow>(
      `insert into scheduled_task_runs (
         task_id, status, trigger_source, scheduled_for, idempotency_key,
         lease_expires_at, attempt_count
       ) values (
         $1, 'running', 'manual', now(), $2,
         now() + make_interval(secs => $3), 1
       ) returning *`,
      [input.taskId, idempotencyKey, leaseSeconds],
    );
    if (!runRow) throw new Error('Manual schedule run insert returned no row');
    await tx.execute(
      `update scheduled_tasks
       set execution_count = execution_count + 1,
           last_executed_at = $2,
           updated_at = now()
       where id = $1 and user_id = $3`,
      [input.taskId, runRow.started_at, input.userId],
    );
    task.executionCount += 1;
    task.lastExecutedAt = runRow.started_at;

    const run = mapScheduleRun(runRow);
    return {
      claim: {
        runId: run.id,
        scheduledFor: run.scheduledFor ?? run.startedAt,
        triggerSource: 'manual',
        startedAt: run.startedAt,
        scope: {
          userId: taskRow.user_id,
          organizationId: taskRow.organization_id ?? null,
        },
        task,
      },
      replay: false,
      run,
    };
  });
}

function scheduleTiming(task: ScheduleTask): ScheduleTiming {
  return {
    scheduleType: task.scheduleType,
    cronExpression: task.cronExpression,
    executeAt: task.executeAt,
    intervalMs: task.intervalMs,
    timezone: task.timezone,
  };
}

function boundedError(error: string | null | undefined): string | null {
  if (!error) return null;
  return error.slice(0, MAX_ERROR_LENGTH);
}

export async function finalizeScheduleRun(
  db: DatabaseAdapter,
  claim: ClaimedScheduleRun,
  outcome: {
    status: Exclude<ScheduleRunStatus, 'running'>;
    result?: Record<string, unknown> | ScheduledExecutionResult | null;
    error?: string | null;
    completedAt: Date;
  },
): Promise<ScheduleRun> {
  const completedAt = outcome.completedAt.toISOString();
  const startedAt = new Date(claim.startedAt ?? claim.scheduledFor);
  const durationMs = Math.max(0, outcome.completedAt.getTime() - startedAt.getTime());

  return db.transaction(async (tx) => {
    const currentTask = await getScheduleForUpdate(tx, claim.task.userId, claim.task.id);
    const [runRow] = await tx.query<RunRow>(
      `update scheduled_task_runs
       set status = $1,
           completed_at = $2,
           duration_ms = $3,
           result = $4::jsonb,
           error = $5,
           lease_expires_at = null
       where id = $6 and task_id = $7 and status = 'running'
       returning *`,
      [
        outcome.status,
        completedAt,
        durationMs,
        JSON.stringify(outcome.result ?? null),
        boundedError(outcome.error),
        claim.runId,
        claim.task.id,
      ],
    );

    if (!runRow) {
      const [existing] = await tx.query<RunRow>(
        `select * from scheduled_task_runs where id = $1 and task_id = $2`,
        [claim.runId, claim.task.id],
      );
      if (!existing) throw new ScheduleNotFoundError('Schedule run not found');
      return mapScheduleRun(existing);
    }

    let nextExecutionAt: string | null = currentTask.nextExecutionAt;
    let nextStatus: ScheduleTask['status'] = currentTask.status;
    let nextEnabled = currentTask.isEnabled;
    if (
      currentTask.maxExecutions !== null &&
      currentTask.executionCount >= currentTask.maxExecutions
    ) {
      nextExecutionAt = null;
      nextStatus = 'completed';
      nextEnabled = false;
    } else if (currentTask.expiresAt && outcome.completedAt >= new Date(currentTask.expiresAt)) {
      nextExecutionAt = null;
      nextStatus = 'expired';
      nextEnabled = false;
    } else if ((claim.triggerSource ?? 'schedule') === 'schedule') {
      if (currentTask.scheduleType === 'once') {
        nextExecutionAt = null;
        nextStatus = 'completed';
        nextEnabled = false;
      } else {
        const next = getNextExecutionAt(
          scheduleTiming(currentTask),
          new Date(claim.scheduledFor),
          outcome.completedAt,
        );
        if (currentTask.expiresAt && next >= new Date(currentTask.expiresAt)) {
          nextExecutionAt = null;
          nextStatus = 'expired';
          nextEnabled = false;
        } else {
          nextExecutionAt = next.toISOString();
        }
      }
    }

    await tx.query(
      `update scheduled_tasks
       set last_executed_at = $2,
           last_error = $3,
           next_execution_at = case
             when status = 'active' and is_enabled = true then $4::timestamptz
             else null
           end,
           status = case when status = 'active' then $5 else status end,
           is_enabled = case when status = 'active' then $6 else is_enabled end,
           updated_at = now()
       where id = $1
       returning id`,
      [
        claim.task.id,
        completedAt,
        outcome.status === 'success' ? null : boundedError(outcome.error ?? outcome.status),
        nextExecutionAt,
        nextStatus,
        nextEnabled,
      ],
    );
    return mapScheduleRun(runRow);
  });
}

function errorMessage(error: unknown): string {
  return boundedError(error instanceof Error ? error.message : String(error)) ?? 'Unknown error';
}

async function announceScheduleRun(
  claim: ClaimedScheduleRun,
  status: ScheduleRunStatus,
): Promise<void> {
  if (status === 'running') return;
  try {
    await notifyScheduleCompleted({
      userId: claim.task.userId,
      taskId: claim.task.id,
      taskName: claim.task.name,
      status,
    });
  } catch (error) {
    logger.warn({ error, taskId: claim.task.id }, 'Schedule completion notification failed');
  }
}

export function processClaimedScheduleRun(
  db: DatabaseAdapter,
  claim: ClaimedScheduleRun,
  execute: ScheduledTaskExecutor,
  options: { timeoutMs: number; signal?: AbortSignal; now?: () => Date },
): Promise<ScheduleRun> {
  return withSpan(
    'schedule.run',
    {
      domain: 'task',
      kind: 'consumer',
      attributes: {
        'task.run_id': claim.runId,
        'task.trigger_source': claim.triggerSource,
      },
    },
    async (span) => {
      const run = await runClaimedSchedule(db, claim, execute, options);
      span.setAttributes({ 'task.status': run.status });
      return run;
    },
  );
}

async function runClaimedSchedule(
  db: DatabaseAdapter,
  claim: ClaimedScheduleRun,
  execute: ScheduledTaskExecutor,
  options: { timeoutMs: number; signal?: AbortSignal; now?: () => Date },
): Promise<ScheduleRun> {
  const now = options.now ?? (() => new Date());
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new DOMException('Schedule execution timed out', 'TimeoutError')),
    options.timeoutMs,
  );
  const signals = options.signal
    ? [options.signal, timeoutController.signal]
    : [timeoutController.signal];
  const signal = signals.length === 1 ? signals[0]! : AbortSignal.any(signals);
  let removeAbortListener = () => {};

  try {
    signal.throwIfAborted();
    const aborted = new Promise<never>((_resolve, reject) => {
      const onAbort = () => {
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new DOMException('Schedule execution aborted', 'AbortError'),
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    });
    if (claim.scope.userId !== claim.task.userId) {
      throw new Error('Scheduled claim owner does not match its task owner');
    }
    const result = await Promise.race([
      execute(claim.task, signal, claim.runId, { ...claim.scope, db }),
      aborted,
    ]);
    const run = await finalizeScheduleRun(db, claim, {
      status: 'success',
      result,
      completedAt: now(),
    });
    await announceScheduleRun(claim, 'success');
    return run;
  } catch (error) {
    const externallyCancelled = options.signal?.aborted === true;
    const timedOut = timeoutController.signal.aborted && !externallyCancelled;
    const status: Exclude<ScheduleRunStatus, 'running' | 'success'> = externallyCancelled
      ? 'cancelled'
      : timedOut
        ? 'timeout'
        : 'failed';
    const run = await finalizeScheduleRun(db, claim, {
      status,
      error: errorMessage(error),
      completedAt: now(),
    });
    await announceScheduleRun(claim, status);
    return run;
  } finally {
    removeAbortListener();
    clearTimeout(timeout);
  }
}

async function findExpiredClaims(
  db: DatabaseAdapter,
  limit: number,
): Promise<ClaimedScheduleRun[]> {
  const rows = await db.query<ClaimRow>(
    `select task.*, run.id as run_id, run.started_at as run_started_at,
            coalesce(run.scheduled_for, run.started_at) as scheduled_for,
            run.trigger_source
     from scheduled_task_runs as run
     join scheduled_tasks as task on task.id = run.task_id
     where run.status = 'running'
       and run.lease_expires_at < now()
     order by run.lease_expires_at asc, run.id asc
     limit $1`,
    [limit],
  );
  return rows.map(mapClaim);
}

export interface ScheduleBatchSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  cancelled: number;
}

export async function processDueScheduleRuns(options: {
  limit: number;
  concurrency: number;
  timeoutMs: number;
  db?: DatabaseAdapter;
  executor?: ScheduledTaskExecutor;
}): Promise<ScheduleBatchSummary> {
  const db = options.db ?? getNeonDb();
  const executor = options.executor ?? executeScheduledAgent;
  const limit = clampInteger(options.limit, 1, MAX_BATCH_SIZE);
  const concurrency = clampInteger(options.concurrency, 1, 10);

  const expired = await findExpiredClaims(db, limit);
  await Promise.all(
    expired.map((claim) => {
      const scopedDb = createClaimedUserScopedDb(db, claim.scope);
      return finalizeScheduleRun(scopedDb, claim, {
        status: 'timeout',
        error: 'Worker lease expired before a terminal result was recorded',
        completedAt: new Date(),
      });
    }),
  );

  const claims = await claimDueScheduleRuns(db, {
    limit,
    leaseSeconds: Math.ceil(options.timeoutMs / 1000) + 5,
  });
  const results: ScheduleRun[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, claims.length) }, async () => {
    while (cursor < claims.length) {
      const index = cursor++;
      const claim = claims[index];
      if (!claim) continue;
      try {
        const scopedDb = createClaimedUserScopedDb(db, claim.scope);
        results.push(
          await processClaimedScheduleRun(scopedDb, claim, executor, {
            timeoutMs: options.timeoutMs,
          }),
        );
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            taskId: claim.task.id,
            runId: claim.runId,
          },
          'Scheduled task could not be finalized; leaving the claim for lease expiry',
        );
      }
    }
  });
  await Promise.all(workers);

  const summary: ScheduleBatchSummary = {
    claimed: claims.length,
    succeeded: results.filter((run) => run.status === 'success').length,
    failed: results.filter((run) => run.status === 'failed').length,
    timedOut: results.filter((run) => run.status === 'timeout').length,
    cancelled: results.filter((run) => run.status === 'cancelled').length,
  };
  logger.info(summary, 'Scheduled task batch completed');
  return summary;
}

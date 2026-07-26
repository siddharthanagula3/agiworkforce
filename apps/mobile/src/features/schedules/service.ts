import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';
import * as Crypto from 'expo-crypto';
import {
  ManagedCloudScheduleListResponseSchema,
  ManagedCloudScheduleResponseSchema,
  ManagedCloudScheduleRunListResponseSchema,
  ManagedCloudScheduleRunResponseSchema,
  managedCloudSchedulePath,
  managedCloudScheduleRunsPath,
  type ManagedCloudScheduleRun,
  type ManagedCloudScheduleTask,
  type ManagedCloudScheduleRecurrence,
} from '@agiworkforce/cloud-contracts';
import type { Schedule, ScheduleRun, CreateScheduleInput } from './store';
import { assertMobileScheduleRecurrenceSupported } from './policy';

/**
 * Schedule API Service
 *
 * All endpoints communicate with the Next.js API routes at /api/schedules.
 */

function assertSchedulesAvailable(): void {
  if (!FEATURES.schedules) throw new Error('schedules: cloud schedules not available in v1');
}

function invalidResponse(message: string): Error {
  return new Error(message);
}

function parseResponse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidResponse(message);
  return parsed.data;
}

function recurrenceFromTask(task: ManagedCloudScheduleTask): ManagedCloudScheduleRecurrence {
  const stored = task.metadata?.['productRecurrence'];
  if (['once', 'daily', 'weekly', 'monthly', 'custom', 'interval'].includes(String(stored))) {
    return stored as ManagedCloudScheduleRecurrence;
  }
  return task.scheduleType === 'cron' ? 'custom' : task.scheduleType;
}

function optionalIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => Number.isInteger(item)) ? (value as number[]) : undefined;
}

function mapSchedule(task: ManagedCloudScheduleTask): Schedule {
  if (task.actionType !== 'agent' || task.prompt === null || task.model === null) {
    throw invalidResponse('Schedules returned an unsupported task type.');
  }
  const recurrence = recurrenceFromTask(task);
  const timeOfDay = task.metadata?.['timeOfDay'];
  const daysOfWeek = optionalIntegerArray(task.metadata?.['daysOfWeek']);
  const dayOfMonth = task.metadata?.['dayOfMonth'];

  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    model: task.model,
    recurrence,
    cronExpression: task.cronExpression ?? undefined,
    scheduledAt: task.executeAt,
    intervalMs: task.intervalMs ?? undefined,
    daysOfWeek,
    dayOfMonth:
      typeof dayOfMonth === 'number' && Number.isInteger(dayOfMonth) ? dayOfMonth : undefined,
    timeOfDay: typeof timeOfDay === 'string' ? timeOfDay : '09:00',
    timezone: task.timezone,
    isActive: task.isEnabled,
    lastRunAt: task.lastExecutedAt,
    nextRunAt: task.nextExecutionAt,
    lastRunStatus:
      task.lastExecutedAt === null ? null : task.lastError === null ? 'success' : 'failed',
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function resultText(run: ManagedCloudScheduleRun): string | null {
  const text = run.result?.['text'];
  if (typeof text === 'string' && text.trim()) return text;
  return run.result === null ? null : JSON.stringify(run.result);
}

function mapRun(run: ManagedCloudScheduleRun): ScheduleRun {
  return {
    id: run.id,
    scheduleId: run.taskId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    result: resultText(run),
    error: run.error,
  };
}

/**
 * Fetch all schedules for the authenticated user.
 */
export async function fetchSchedules(): Promise<Schedule[]> {
  assertSchedulesAvailable();
  const value = await api.get<unknown>('/api/schedules');
  const data = parseResponse(
    ManagedCloudScheduleListResponseSchema,
    value,
    'Schedules returned an invalid response.',
  );
  return data.schedules.map(mapSchedule);
}

/**
 * Create a new scheduled task.
 */
export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  assertSchedulesAvailable();
  assertMobileScheduleRecurrenceSupported(input.recurrence);
  const value = await api.post<unknown>('/api/schedules', input);
  const data = parseResponse(
    ManagedCloudScheduleResponseSchema,
    value,
    'Schedule creation returned an invalid response.',
  );
  return mapSchedule(data.schedule);
}

/**
 * Update an existing schedule.
 */
export async function updateSchedule(
  id: string,
  input: Partial<CreateScheduleInput>,
): Promise<Schedule> {
  assertSchedulesAvailable();
  if (input.recurrence !== undefined) {
    assertMobileScheduleRecurrenceSupported(input.recurrence);
  }
  const value = await api.put<unknown>(managedCloudSchedulePath(id), input);
  const data = parseResponse(
    ManagedCloudScheduleResponseSchema,
    value,
    'Schedule update returned an invalid response.',
  );
  return mapSchedule(data.schedule);
}

/**
 * Delete a schedule permanently.
 */
export async function deleteSchedule(id: string): Promise<void> {
  assertSchedulesAvailable();
  await api.delete(managedCloudSchedulePath(id));
}

/**
 * Toggle a schedule's active status.
 */
export async function toggleSchedule(id: string, isActive: boolean): Promise<Schedule> {
  assertSchedulesAvailable();
  const value = await api.patch<unknown>(managedCloudSchedulePath(id), {
    isActive,
  });
  const data = parseResponse(
    ManagedCloudScheduleResponseSchema,
    value,
    'Schedule status update returned an invalid response.',
  );
  return mapSchedule(data.schedule);
}

/**
 * Fetch run history for a specific schedule.
 */
export async function fetchScheduleRuns(scheduleId: string): Promise<ScheduleRun[]> {
  assertSchedulesAvailable();
  const value = await api.get<unknown>(managedCloudScheduleRunsPath(scheduleId));
  const data = parseResponse(
    ManagedCloudScheduleRunListResponseSchema,
    value,
    'Schedule run history returned an invalid response.',
  );
  return data.runs.map(mapRun);
}

/**
 * Trigger an immediate run of a schedule.
 */
export async function triggerScheduleNow(id: string): Promise<ScheduleRun> {
  assertSchedulesAvailable();
  const idempotencyKey = `agi.schedule.mobile.${Crypto.randomUUID()}`;
  const value = await api.post<unknown>(managedCloudScheduleRunsPath(id), undefined, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  const data = parseResponse(
    ManagedCloudScheduleRunResponseSchema,
    value,
    'Schedule execution returned an invalid response.',
  );
  return mapRun(data.run);
}

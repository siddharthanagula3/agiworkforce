import { z } from 'zod';

export const MANAGED_CLOUD_SCHEDULES_PATH = '/api/schedules';

const NullableRecordSchema = z.record(z.string(), z.unknown()).nullable();

export const ManagedCloudScheduleRecurrenceSchema = z.enum([
  'once',
  'daily',
  'weekly',
  'monthly',
  'custom',
  'interval',
]);
export type ManagedCloudScheduleRecurrence = z.infer<typeof ManagedCloudScheduleRecurrenceSchema>;

export const ManagedCloudScheduleTaskSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  scheduleType: z.enum(['cron', 'once', 'interval']),
  cronExpression: z.string().nullable(),
  executeAt: z.string().nullable(),
  intervalMs: z.number().int().nullable(),
  timezone: z.string(),
  isEnabled: z.boolean(),
  expiresAt: z.string().nullable(),
  maxExecutions: z.number().int().nullable(),
  executionCount: z.number().int().nonnegative(),
  actionType: z.enum(['agent', 'workflow', 'notification', 'command']),
  actionConfig: NullableRecordSchema,
  prompt: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['active', 'paused', 'completed', 'failed', 'expired']),
  lastExecutedAt: z.string().nullable(),
  nextExecutionAt: z.string().nullable(),
  lastError: z.string().nullable(),
  metadata: NullableRecordSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ManagedCloudScheduleTask = z.infer<typeof ManagedCloudScheduleTaskSchema>;

export const ManagedCloudScheduleRunSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: z.enum(['running', 'success', 'failed', 'timeout', 'cancelled']),
  triggerSource: z.enum(['schedule', 'manual', 'webhook', 'api']),
  scheduledFor: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  result: NullableRecordSchema,
  error: z.string().nullable(),
  idempotencyKey: z.string(),
  leaseExpiresAt: z.string().nullable(),
  attemptCount: z.number().int().positive(),
});
export type ManagedCloudScheduleRun = z.infer<typeof ManagedCloudScheduleRunSchema>;

export const ManagedCloudSchedulePaginationSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const ManagedCloudScheduleListResponseSchema = z.object({
  schedules: z.array(ManagedCloudScheduleTaskSchema),
  pagination: ManagedCloudSchedulePaginationSchema,
});

export const ManagedCloudScheduleResponseSchema = z.object({
  schedule: ManagedCloudScheduleTaskSchema,
});

export const ManagedCloudScheduleRunListResponseSchema = z.object({
  runs: z.array(ManagedCloudScheduleRunSchema),
  pagination: ManagedCloudSchedulePaginationSchema,
});

export const ManagedCloudScheduleRunResponseSchema = z.object({
  run: ManagedCloudScheduleRunSchema,
  replay: z.boolean(),
});

export const ManagedCloudScheduleDeleteResponseSchema = z.object({ success: z.literal(true) });

export function managedCloudSchedulePath(scheduleId: string): string {
  return `${MANAGED_CLOUD_SCHEDULES_PATH}/${encodeURIComponent(scheduleId)}`;
}

export function managedCloudScheduleRunsPath(scheduleId: string): string {
  return `${managedCloudSchedulePath(scheduleId)}/runs`;
}

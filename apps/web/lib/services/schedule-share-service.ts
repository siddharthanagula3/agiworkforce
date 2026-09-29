import 'server-only';

import { randomBytes } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN,
  ManagedCloudScheduleShareSnapshotSchema,
  type ManagedCloudScheduleShare,
  type ManagedCloudScheduleShareSnapshot,
} from '@agiworkforce/cloud-contracts';
import type { ScheduleTask } from './schedule-service';
import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';

const SHARED_METADATA_KEYS = ['productRecurrence', 'timeOfDay', 'daysOfWeek', 'dayOfMonth'];

interface ShareRow {
  token: string;
  snapshot: unknown;
  created_at: string | Date;
}

function isoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toShare(row: ShareRow): ManagedCloudScheduleShare | null {
  const snapshot = ManagedCloudScheduleShareSnapshotSchema.safeParse(row.snapshot);
  if (!snapshot.success) return null;
  return { token: row.token, snapshot: snapshot.data, createdAt: isoString(row.created_at) };
}

export function scheduleShareSnapshot(task: ScheduleTask): ManagedCloudScheduleShareSnapshot {
  const metadata = task.metadata ?? {};
  return {
    name: task.name,
    description: task.description,
    prompt: task.prompt ?? '',
    model: task.model,
    scheduleType: task.scheduleType,
    cronExpression: task.cronExpression,
    intervalMs: task.intervalMs,
    recurrenceRule: task.recurrenceRule ?? null,
    dayparts: task.dayparts ?? null,
    metadata: Object.fromEntries(
      SHARED_METADATA_KEYS.filter((key) => key in metadata).map((key) => [key, metadata[key]]),
    ),
    missedExecutionPolicy: task.missedExecutionPolicy ?? 'run_once',
    retryMaxAttempts: task.retryMaxAttempts ?? 0,
    retryBackoffSeconds: task.retryBackoffSeconds ?? 300,
  };
}

export async function saveScheduleShare(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
  snapshot: ManagedCloudScheduleShareSnapshot,
): Promise<ManagedCloudScheduleShare> {
  const [row] = await db.query<ShareRow>(
    `insert into scheduled_task_shares (token, user_id, task_id, snapshot, created_by)
     values ($1, $2, $3, $4::jsonb, $2)
     on conflict (task_id) where revoked_at is null and task_id is not null
     do update set snapshot = excluded.snapshot
     returning token, snapshot, created_at`,
    [randomBytes(18).toString('base64url'), userId, taskId, JSON.stringify(snapshot)],
  );
  const share = row ? toShare(row) : null;
  if (!share) throw new Error('The schedule share could not be saved');
  return share;
}

export async function unshareSchedule(
  db: DatabaseAdapter,
  userId: string,
  taskId: string,
): Promise<void> {
  await db.query(
    `update scheduled_task_shares
        set revoked_at = now()
      where user_id = $1 and task_id = $2 and revoked_at is null`,
    [userId, taskId],
  );
}

export async function getSharedSchedule(
  db: DatabaseAdapter,
  token: string,
): Promise<ManagedCloudScheduleShare | null> {
  if (!MANAGED_CLOUD_SCHEDULE_SHARE_TOKEN_PATTERN.test(token)) return null;
  const [row] = await db.query<ShareRow>(
    `select token, snapshot, created_at
       from scheduled_task_shares
      where token = $1 and revoked_at is null
        and ${ownerMayRunUnattendedSql('scheduled_task_shares.user_id', 2)}
      limit 1`,
    [token, UNATTENDED_RUN_DENIED_STATUSES],
  );
  return row ? toShare(row) : null;
}

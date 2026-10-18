import 'server-only';

import { ManagedCloudScheduleNotificationSettingsSchema } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { sendPushToUser } from './push-notification-service';
import { sendScheduleCompletionEmail } from './notification-email-service';
import { recordNotification } from './notification-service';

export const SCHEDULE_PUSH_PREFERENCE_KEY = 'mobilePushScheduleDone';
export const SCHEDULE_EMAIL_PREFERENCE_KEY = 'emailScheduleDone';

export async function loadSchedulePreferences(
  db: DatabaseAdapter,
  userId: string,
  notice?: Pick<ScheduleCompletionNotice, 'taskId' | 'status'>,
): Promise<{ push: boolean; email: boolean; email_address: string | null; enabled: boolean }> {
  try {
    const [row] = await db.query<{
      notifications: unknown;
      email: string | null;
      schedule_notifications?: unknown;
      schedule_exists?: boolean;
    }>(
      `select coalesce(us.settings -> 'notifications', '{}'::jsonb) as notifications,
              p.email as email,
              (select st.metadata -> 'notificationSettings' from public.scheduled_tasks st
                where st.id = $2 and st.user_id = $1
                  and st.organization_id is not distinct from public.current_app_org_id()) as schedule_notifications,
              ($2::uuid is null or exists (select 1 from public.scheduled_tasks st where st.id = $2 and st.user_id = $1
                  and st.organization_id is not distinct from public.current_app_org_id())) as schedule_exists
         from public.profiles as p
         left join public.user_settings as us on us.user_id = p.id
        where p.id = $1
        limit 1`,
      [userId, notice?.taskId ?? null],
    );
    const preferences =
      row?.notifications &&
      typeof row.notifications === 'object' &&
      !Array.isArray(row.notifications)
        ? (row.notifications as Record<string, unknown>)
        : {};
    const schedule = ManagedCloudScheduleNotificationSettingsSchema.parse(
      row?.schedule_notifications ?? {},
    );
    const enabled =
      row !== undefined &&
      row.schedule_exists !== false &&
      (!notice ||
        (notice.status === 'success'
          ? schedule.onSuccess
          : notice.status === 'awaiting_approval'
            ? schedule.onApproval
            : schedule.onFailure));
    return {
      enabled,
      push: enabled && schedule.push && preferences[SCHEDULE_PUSH_PREFERENCE_KEY] !== false,
      email: enabled && schedule.email && preferences[SCHEDULE_EMAIL_PREFERENCE_KEY] !== false,
      email_address: typeof row?.email === 'string' ? row.email : null,
    };
  } catch (error) {
    logger.warn({ error, userId }, '[notifications] could not read preferences');
    return { push: false, email: false, email_address: null, enabled: false };
  }
}

function shortTitle(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export interface ScheduleCompletionNotice {
  userId: string;
  taskId: string;
  taskName: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled' | 'awaiting_approval';
  runId?: string;
  approvalStep?: number;
  approvalSummary?: string;
}

export function scheduleNoticeKey(
  prefix: string,
  notice: Pick<ScheduleCompletionNotice, 'status' | 'approvalStep'> & { runId: string },
): string {
  return notice.status === 'awaiting_approval'
    ? `${prefix}:${notice.runId}:approval:${notice.approvalStep ?? 0}`
    : `${prefix}:${notice.runId}`;
}

function noticeCopy(notice: ScheduleCompletionNotice): {
  title: string;
  body: string;
  severity: 'success' | 'error' | 'warning';
} {
  const name = shortTitle(notice.taskName);
  if (notice.status === 'awaiting_approval') {
    return {
      title: 'Scheduled task needs your approval',
      body: notice.approvalSummary
        ? `“${name}” is paused until you approve or deny: ${notice.approvalSummary}.`
        : `“${name}” is paused until you approve or deny its next step.`,
      severity: 'warning',
    };
  }
  if (notice.status === 'success') {
    return { title: 'Scheduled task finished', body: `“${name}” completed.`, severity: 'success' };
  }
  return {
    title: 'Scheduled task failed',
    body: `“${name}” ${notice.status === 'timeout' ? 'timed out' : 'failed'}.`,
    severity: 'error',
  };
}

export async function notifyScheduleCompleted(
  db: DatabaseAdapter,
  notice: ScheduleCompletionNotice,
  options: { email?: boolean } = {},
): Promise<{ pushed: boolean; emailed: boolean }> {
  const includeEmail = options.email ?? true;
  const none = { pushed: false, emailed: false };
  try {
    if (notice.status === 'cancelled') return none;
    const loaded = await loadSchedulePreferences(db, notice.userId, notice);
    if (!loaded.enabled) return none;

    const { title, body, severity } = noticeCopy(notice);

    const recorded = await recordNotification(db, {
      userId: notice.userId,
      category: 'schedule',
      severity,
      title,
      message: body,
      target: { kind: 'schedule', id: notice.taskId },
      dedupeKey: notice.runId
        ? scheduleNoticeKey('schedule-run', { ...notice, runId: notice.runId })
        : null,
    });

    if (!recorded.recorded) return none;
    const preferences = { ...loaded, email: includeEmail && loaded.email };
    if (!preferences.push && !preferences.email) return none;

    const [pushResult, emailResult] = await Promise.all([
      preferences.push
        ? sendPushToUser(
            notice.userId,
            {
              title,
              body,
              data: { type: 'schedule_run', taskId: notice.taskId },
            },
            // The opt-in behind `preferences.push` is settings' "Mobile push",
            // described there as the AGI app on signed-in devices. Browsers
            // consent separately and are not covered by it.
            { expo: true, web: false },
          ).catch(() => null)
        : Promise.resolve(null),
      preferences.email && preferences.email_address
        ? sendScheduleCompletionEmail({
            to: preferences.email_address,
            taskName: notice.taskName,
            status: notice.status,
            ...(notice.runId
              ? {
                  idempotencyKey: scheduleNoticeKey('schedule-email', {
                    ...notice,
                    runId: notice.runId,
                  }),
                }
              : {}),
            ...(notice.approvalSummary ? { approvalSummary: notice.approvalSummary } : {}),
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    return {
      pushed: (pushResult?.sent ?? 0) > 0,
      emailed: emailResult?.delivered === true,
    };
  } catch (error) {
    logger.warn({ error, taskId: notice.taskId }, '[notifications] schedule notify failed');
    return none;
  }
}

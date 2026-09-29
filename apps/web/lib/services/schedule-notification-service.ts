import 'server-only';

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
): Promise<{ push: boolean; email: boolean; email_address: string | null }> {
  try {
    const [row] = await db.query<{ notifications: unknown; email: string | null }>(
      `select coalesce(us.settings -> 'notifications', '{}'::jsonb) as notifications,
              p.email as email
         from public.profiles as p
         left join public.user_settings as us on us.user_id = p.id
        where p.id = $1
        limit 1`,
      [userId],
    );
    const preferences =
      row?.notifications &&
      typeof row.notifications === 'object' &&
      !Array.isArray(row.notifications)
        ? (row.notifications as Record<string, unknown>)
        : {};
    return {
      push: preferences[SCHEDULE_PUSH_PREFERENCE_KEY] !== false,
      email: preferences[SCHEDULE_EMAIL_PREFERENCE_KEY] !== false,
      email_address: typeof row?.email === 'string' ? row.email : null,
    };
  } catch (error) {
    logger.warn({ error, userId }, '[notifications] could not read preferences');
    return { push: false, email: false, email_address: null };
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

    const { title, body, severity } = noticeCopy(notice);
    const awaitingApproval = notice.status === 'awaiting_approval';

    await recordNotification(db, {
      userId: notice.userId,
      category: 'schedule',
      severity,
      title,
      message: body,
      target: { kind: 'schedule', id: notice.taskId },
      dedupeKey: notice.runId
        ? awaitingApproval
          ? `schedule-run:${notice.runId}:approval:${notice.approvalStep ?? 0}`
          : `schedule-run:${notice.runId}`
        : null,
    });

    const loaded = await loadSchedulePreferences(db, notice.userId);
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

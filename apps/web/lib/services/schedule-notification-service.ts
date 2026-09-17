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
      push: preferences[SCHEDULE_PUSH_PREFERENCE_KEY] === true,
      email: preferences[SCHEDULE_EMAIL_PREFERENCE_KEY] === true,
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
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
  runId?: string;
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

    const succeeded = notice.status === 'success';
    const timedOut = notice.status === 'timeout';
    const title = succeeded ? 'Scheduled task finished' : 'Scheduled task failed';
    const body = succeeded
      ? `“${shortTitle(notice.taskName)}” completed.`
      : `“${shortTitle(notice.taskName)}” ${timedOut ? 'timed out' : 'failed'}.`;

    await recordNotification(db, {
      userId: notice.userId,
      category: 'schedule',
      severity: succeeded ? 'success' : 'error',
      title,
      message: body,
      target: { kind: 'schedule', id: notice.taskId },
      dedupeKey: notice.runId ? `schedule-run:${notice.runId}` : null,
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
            status: succeeded ? 'success' : timedOut ? 'timeout' : 'failed',
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

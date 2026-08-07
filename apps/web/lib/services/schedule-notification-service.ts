import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { sendPushToUser } from './push-notification-service';
import { sendScheduleCompletionEmail } from './notification-email-service';

/**
 * Notify a user that one of their scheduled tasks finished.
 *
 * This is the FIRST consumer of the push send path, and it was chosen because
 * it is the one event that genuinely happens while the user is not looking: a
 * schedule runs on the server, on its own clock, with no session attached.
 * Everything else the removed toggles once claimed ("reply ready", "agent
 * done") happens while the user is in the app, where the in-app UI already
 * says so.
 *
 * OPT-IN, per channel. Nothing is sent unless the account explicitly enabled
 * that channel in the `notifications` preference namespace. An absent
 * preference means OFF: a user who registered a device by installing the app
 * never agreed to be pushed, and defaulting to on would be the reverse of what
 * a notification setting is for. The same applies to email.
 *
 * The two channels are INDEPENDENT — one failing must not suppress the other,
 * which is why they are dispatched together and each catches its own error.
 */

/** Preference keys. Mirrored by the toggles in `NotificationsSection`. */
export const SCHEDULE_PUSH_PREFERENCE_KEY = 'mobilePushScheduleDone';
export const SCHEDULE_EMAIL_PREFERENCE_KEY = 'emailScheduleDone';

/** Both channel preferences, read in one query. */
async function loadSchedulePreferences(
  userId: string,
): Promise<{ push: boolean; email: boolean; email_address: string | null }> {
  try {
    const [row] = await getNeonDb().query<{ notifications: unknown; email: string | null }>(
      // `profiles` is keyed by `id`, NOT `user_id` — the settings table uses
      // `user_id`. Joining on the wrong column here would have returned no row
      // and silently disabled every notification.
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
    // Explicit true only. Missing, malformed, or false all mean no notification.
    return {
      push: preferences[SCHEDULE_PUSH_PREFERENCE_KEY] === true,
      email: preferences[SCHEDULE_EMAIL_PREFERENCE_KEY] === true,
      email_address: typeof row?.email === 'string' ? row.email : null,
    };
  } catch (error) {
    // Fail CLOSED: a settings outage must not start sending notifications the
    // user may never have enabled.
    logger.warn({ error, userId }, '[notifications] could not read preferences');
    return { push: false, email: false, email_address: null };
  }
}

/** Trim a task name for a notification body without cutting mid-word noise. */
function shortTitle(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export interface ScheduleCompletionNotice {
  userId: string;
  taskId: string;
  taskName: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
}

/**
 * Best-effort. Returns whether a push was actually dispatched, and never
 * throws: the run has already been finalized by the time this is called, and a
 * notification failure must not change the recorded outcome of the work.
 */
export async function notifyScheduleCompleted(
  notice: ScheduleCompletionNotice,
): Promise<{ pushed: boolean; emailed: boolean }> {
  const none = { pushed: false, emailed: false };
  try {
    // A cancelled run was stopped BY the user, who therefore already knows.
    if (notice.status === 'cancelled') return none;

    const preferences = await loadSchedulePreferences(notice.userId);
    if (!preferences.push && !preferences.email) return none;

    const succeeded = notice.status === 'success';
    const timedOut = notice.status === 'timeout';

    // Channels are independent: one failing must not suppress the other.
    const [pushResult, emailResult] = await Promise.all([
      preferences.push
        ? sendPushToUser(notice.userId, {
            title: succeeded ? 'Scheduled task finished' : 'Scheduled task failed',
            body: succeeded
              ? `“${shortTitle(notice.taskName)}” completed.`
              : `“${shortTitle(notice.taskName)}” ${timedOut ? 'timed out' : 'failed'}.`,
            // Deep-link material only. No task OUTPUT is included: a
            // notification renders on a lock screen, and scheduled runs can
            // produce anything.
            data: { type: 'schedule_run', taskId: notice.taskId },
          }).catch(() => null)
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

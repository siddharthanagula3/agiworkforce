import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { sendPushToUser } from './push-notification-service';

/**
 * Preference key for cloud agent lifecycle push.
 *
 * `schedule-notification-service` gates on an opt-IN key because a scheduled
 * run is a background convenience the user may never have asked to hear about.
 * An agent run the user started themselves, and that is now blocked on them,
 * or has just stopped, is operational, so this key is opt-OUT: only an
 * explicit `false` silences it. The device still has the final say, because
 * mobile's `notificationPrefsStore` categories suppress display per event type.
 */
export const AGENT_PUSH_PREFERENCE_KEY = 'mobilePushAgentActivity';

export type AgentRunNotificationEvent =
  | 'approval_required'
  | 'input_required'
  | 'completed'
  | 'failed';

/**
 * `data.type` values `apps/mobile/services/notifications.ts` switches on. A
 * value outside this set falls through the client's `default:` branch and
 * opens app home, so these must stay in step with `NotificationEventType`.
 */
const MOBILE_NOTIFICATION_TYPE: Record<AgentRunNotificationEvent, string> = {
  approval_required: 'agent_approval_needed',
  input_required: 'agent_paused',
  completed: 'task_completed',
  failed: 'agent_failed',
};

/** Mirrors the priorities `companionNotifications.ts` uses for the same events. */
const MOBILE_PRIORITY: Record<AgentRunNotificationEvent, string> = {
  approval_required: 'high',
  input_required: 'high',
  completed: 'normal',
  failed: 'critical',
};

/** Routes mobile's `isAllowedRoute` accepts; anything else the client drops. */
const MOBILE_ROUTE: Record<AgentRunNotificationEvent, string> = {
  approval_required: '/(app)/companion',
  input_required: '/(app)/agents',
  completed: '/(app)/agents',
  failed: '/(app)/agents',
};

async function loadAgentPushPreference(db: DatabaseAdapter, userId: string): Promise<boolean> {
  try {
    const [row] = await db.query<{ notifications: unknown }>(
      `select coalesce(us.settings -> 'notifications', '{}'::jsonb) as notifications
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
    return preferences[AGENT_PUSH_PREFERENCE_KEY] !== false;
  } catch (error) {
    // Fail open: the send itself reads `mobile_devices`, so a database outage
    // still ends in a no-op rather than an unwanted push.
    logger.warn({ error, userId }, '[notifications] could not read agent push preference');
    return true;
  }
}

function shortLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

export interface AgentRunNotice {
  userId: string;
  runId: string;
  event: AgentRunNotificationEvent;
  /** Qualified name of the tool the run is blocked on, when there is one. */
  toolName?: string | null;
}

function describeAgentRunEvent(notice: AgentRunNotice): { title: string; body: string } {
  const tool = notice.toolName ? shortLabel(notice.toolName) : null;
  switch (notice.event) {
    case 'approval_required':
      return {
        title: 'Approval needed',
        body: tool
          ? `Your agent needs approval to run “${tool}”.`
          : 'Your agent is waiting for your approval.',
      };
    case 'input_required':
      return {
        title: 'Your agent has a question',
        body: tool
          ? `“${tool}” needs more information before it can continue.`
          : 'Your agent needs more information before it can continue.',
      };
    case 'completed':
      return { title: 'Agent run finished', body: 'Your agent finished its run.' };
    case 'failed':
      return { title: 'Agent run failed', body: 'Your agent stopped before it finished.' };
  }
}

export async function notifyAgentRunEvent(
  db: DatabaseAdapter,
  notice: AgentRunNotice,
): Promise<{ pushed: boolean }> {
  const none = { pushed: false };
  try {
    // `AGENT_PUSH_PREFERENCE_KEY` is the mobile app's own switch and governs
    // only the mobile transport. A browser is registered from the web settings
    // toggle and turned off from the same place, so it carries its own consent
    // and is not silenced by a preference set on a phone.
    const toExpo = await loadAgentPushPreference(db, notice.userId);

    const { title, body } = describeAgentRunEvent(notice);
    const result = await sendPushToUser(
      notice.userId,
      {
        title,
        body,
        data: {
          type: MOBILE_NOTIFICATION_TYPE[notice.event],
          priority: MOBILE_PRIORITY[notice.event],
          route: MOBILE_ROUTE[notice.event],
          runId: notice.runId,
        },
      },
      { expo: toExpo, web: true },
    ).catch(() => null);

    return { pushed: (result?.sent ?? 0) > 0 };
  } catch (error) {
    logger.warn({ error, runId: notice.runId }, '[notifications] agent notify failed');
    return none;
  }
}

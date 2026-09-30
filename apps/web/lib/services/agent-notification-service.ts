import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { CloudCodeAgentStopReason } from '@agiworkforce/types';
import {
  codeSessionActivityNotice,
  type LocalCodeSessionActivity,
} from '@agiworkforce/cloud-contracts';
import { logger } from '@/lib/logger';
import type { NotificationSeverity } from '@/features/notifications/lib/notification-target';
import { recordNotification } from './notification-service';
import { sendPushToUser } from './push-notification-service';
import { trackProductAnalyticsEvent } from '@/lib/server/product-analytics';

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
  'approval_required' | 'input_required' | 'completed' | 'failed';

/**
 * `data.type` values `apps/mobile/services/notifications.ts` switches on. A
 * value outside this set falls through the client's `default:` branch and
 * opens app home, so these must stay in step with `NotificationEventType`.
 */
const MOBILE_NOTIFICATION_TYPE: Record<AgentRunNotificationEvent, string> = {
  approval_required: 'agent_approval_needed',
  input_required: 'agent_approval_needed',
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
const MOBILE_RUN_ROUTE = '/(app)/tasks';

const FEED_SEVERITY: Record<AgentRunNotificationEvent, NotificationSeverity> = {
  approval_required: 'warning',
  input_required: 'warning',
  completed: 'success',
  failed: 'error',
};

const RESEARCH_MOBILE_ROUTE = '/(app)/reports';

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
    const { title, body } = describeAgentRunEvent(notice);
    const terminal = notice.event === 'completed' || notice.event === 'failed';
    if (terminal) {
      trackProductAnalyticsEvent(
        { userId: notice.userId },
        {
          name: 'work_run_finished',
          surface: 'web',
          outcome: notice.event === 'completed' ? 'succeeded' : 'failed',
        },
      );
    }
    await recordNotification(db, {
      userId: notice.userId,
      category: 'agent_run',
      severity: FEED_SEVERITY[notice.event],
      title,
      message: body,
      target: { kind: 'work', id: notice.runId },
      dedupeKey: terminal ? `agent-run:${notice.runId}:${notice.event}` : null,
    });

    const toExpo = await loadAgentPushPreference(db, notice.userId);
    const result = await sendPushToUser(
      notice.userId,
      {
        title,
        body,
        data: {
          type: MOBILE_NOTIFICATION_TYPE[notice.event],
          priority: MOBILE_PRIORITY[notice.event],
          route: MOBILE_RUN_ROUTE,
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

export interface ResearchReportNotice {
  userId: string;
  reportId: string;
  requestId: string;
  title: string;
  status: string;
  sourcesConsulted: number;
}

export async function notifyResearchReportSettled(
  db: DatabaseAdapter,
  notice: ResearchReportNotice,
): Promise<{ recorded: boolean; pushed: boolean }> {
  const none = { recorded: false, pushed: false };
  if (notice.status !== 'completed' && notice.status !== 'failed') return none;
  try {
    const completed = notice.status === 'completed';
    trackProductAnalyticsEvent(
      { userId: notice.userId },
      {
        name: 'research_run_finished',
        surface: 'web',
        outcome: completed ? 'succeeded' : 'failed',
      },
    );
    const label = shortLabel(notice.title) || 'Your research';
    const title = completed ? 'Research report ready' : 'Research did not finish';
    const body = completed
      ? `“${label}” is ready, drawn from ${notice.sourcesConsulted} ${notice.sourcesConsulted === 1 ? 'source' : 'sources'}.`
      : `“${label}” stopped before the report was written.`;

    const { recorded } = await recordNotification(db, {
      userId: notice.userId,
      category: 'research',
      severity: completed ? 'success' : 'error',
      title,
      message: body,
      target: { kind: 'research', id: notice.reportId },
      dedupeKey: `research:${notice.requestId}:${notice.status}`,
    });
    if (!recorded) return none;

    const toExpo = await loadAgentPushPreference(db, notice.userId);
    const result = await sendPushToUser(
      notice.userId,
      {
        title,
        body,
        data: {
          type: completed ? 'task_completed' : 'agent_failed',
          priority: completed ? 'normal' : 'critical',
          route: RESEARCH_MOBILE_ROUTE,
          target: 'research',
          targetId: notice.reportId,
        },
      },
      { expo: toExpo, web: true },
    ).catch(() => null);

    return { recorded, pushed: (result?.sent ?? 0) > 0 };
  } catch (error) {
    logger.warn({ error, reportId: notice.reportId }, '[notifications] research notify failed');
    return none;
  }
}

export type CloudCodeTurnNotificationEvent = Extract<
  AgentRunNotificationEvent,
  'approval_required' | 'completed' | 'failed'
>;

export function cloudCodeTurnNotificationEvent(
  stopReason: CloudCodeAgentStopReason,
): CloudCodeTurnNotificationEvent | null {
  switch (stopReason) {
    case 'awaiting_approval':
      return 'approval_required';
    case 'done':
      return 'completed';
    case 'error':
    case 'timeout':
    case 'max_steps':
      return 'failed';
    case 'cancelled':
    case 'denied':
      return null;
  }
}

export interface CloudCodeTurnNotice {
  userId: string;
  sessionId: string;
  sessionTitle: string | null;
  turnId: string;
  event: CloudCodeTurnNotificationEvent;
  approvalStepIndex?: number;
}

function describeCloudCodeTurnEvent(notice: CloudCodeTurnNotice): { title: string; body: string } {
  const session = shortLabel(notice.sessionTitle ?? '');
  return codeSessionActivityNotice(
    notice.event,
    session ? `“${session}”` : 'Your AGI Code session',
  );
}

export async function notifyCloudCodeTurnEvent(
  db: DatabaseAdapter,
  notice: CloudCodeTurnNotice,
): Promise<{ pushed: boolean }> {
  try {
    const { title, body } = describeCloudCodeTurnEvent(notice);
    const occurrence =
      notice.event === 'approval_required'
        ? `${notice.event}:${notice.approvalStepIndex ?? 0}`
        : notice.event;
    await recordNotification(db, {
      userId: notice.userId,
      category: 'agent_run',
      severity: FEED_SEVERITY[notice.event],
      title,
      message: body,
      target: { kind: 'code-session', id: notice.sessionId },
      dedupeKey: `code-turn:${notice.turnId}:${occurrence}`,
    });

    const toExpo = await loadAgentPushPreference(db, notice.userId);
    const result = await sendPushToUser(
      notice.userId,
      {
        title,
        body,
        data: {
          type: MOBILE_NOTIFICATION_TYPE[notice.event],
          priority: MOBILE_PRIORITY[notice.event],
          codeSessionId: notice.sessionId,
        },
      },
      { expo: toExpo, web: true },
    ).catch(() => null);

    return { pushed: (result?.sent ?? 0) > 0 };
  } catch (error) {
    logger.warn({ error, turnId: notice.turnId }, '[notifications] code turn notify failed');
    return { pushed: false };
  }
}

export interface LocalCodeSessionNotice {
  userId: string;
  deviceName: string | null;
  activity: LocalCodeSessionActivity;
}

function describeLocalCodeSessionEvent(notice: LocalCodeSessionNotice): {
  title: string;
  body: string;
} {
  const session = shortLabel(notice.activity.sessionTitle ?? '');
  const device = shortLabel(notice.deviceName ?? '') || 'your computer';
  return codeSessionActivityNotice(
    notice.activity.event,
    session ? `“${session}” on ${device}` : `A session on ${device}`,
  );
}

export async function notifyLocalCodeSessionEvent(
  db: DatabaseAdapter,
  notice: LocalCodeSessionNotice,
): Promise<{ pushed: boolean }> {
  try {
    if (!(await loadAgentPushPreference(db, notice.userId))) return { pushed: false };
    const { title, body } = describeLocalCodeSessionEvent(notice);
    const { event, rootId, threadId, approvalId } = notice.activity;
    const result = await sendPushToUser(
      notice.userId,
      {
        title,
        body,
        data: {
          type: MOBILE_NOTIFICATION_TYPE[event],
          priority: MOBILE_PRIORITY[event],
          rootId,
          threadId,
          ...(approvalId ? { approvalId } : {}),
        },
      },
      { expo: true, web: false },
    ).catch(() => null);

    return { pushed: (result?.sent ?? 0) > 0 };
  } catch (error) {
    logger.warn(
      { error, turnId: notice.activity.turnId },
      '[notifications] local code session notify failed',
    );
    return { pushed: false };
  }
}

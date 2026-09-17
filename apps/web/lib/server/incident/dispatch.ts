import 'server-only';

import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

import {
  ESCALATION_LEVELS,
  levelForElapsedMinutes,
  respondersForLevel,
  resolveOnCallRotation,
  type EscalationLevel,
} from './on-call';
import {
  alertHtml,
  pageOnCall,
  postToIncidentChannel,
  type AlertSeverity,
  type PageOutcome,
  type PageTarget,
} from './pager';

const INCIDENT_KEY_PREFIX = 'agi-incident';
const INCIDENT_TTL_SECONDS = 6 * 60 * 60;
const MINUTE_MS = 60 * 1_000;

interface IncidentState {
  firstNotifiedAtMs: number;
  level: EscalationLevel;
}

export interface IncidentNotification {
  key: string;
  severity: AlertSeverity;
  subject: string;
  text: string;
  source?: string;
}

export interface IncidentDispatchResult {
  level: EscalationLevel;
  notified: readonly string[];
  delivery: 'delivered' | 'undeliverable';
  paged: PageOutcome;
  channel: PageOutcome;
  reason?: string;
}

function stateKey(key: string): string {
  return `${INCIDENT_KEY_PREFIX}:${key}`;
}

/**
 * How long this condition has been firing, which is the only acknowledgement
 * signal available without a pager vendor: a page nobody acted on is a page
 * whose condition is still true on the next run.
 */
async function escalationLevel(key: string, now: Date): Promise<EscalationLevel> {
  const store = getKeyValueStore();
  const rotation = resolveOnCallRotation();
  if (!store) return ESCALATION_LEVELS.primary;

  try {
    const existing = await store.get<IncidentState>(stateKey(key));
    const firstNotifiedAtMs = existing?.firstNotifiedAtMs ?? now.getTime();
    const elapsedMinutes = (now.getTime() - firstNotifiedAtMs) / MINUTE_MS;
    const level = levelForElapsedMinutes(elapsedMinutes, rotation);
    await store.set(stateKey(key), { firstNotifiedAtMs, level } satisfies IncidentState, {
      ttlSeconds: INCIDENT_TTL_SECONDS,
    });
    return level;
  } catch (error) {
    logger.error({ error, key }, 'Incident escalation state could not be read');
    return ESCALATION_LEVELS.primary;
  }
}

export async function clearIncident(key: string): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.delete(stateKey(key));
  } catch (error) {
    logger.error({ error, key }, 'Incident escalation state could not be cleared');
  }
}

function recipients(level: EscalationLevel, now: Date): readonly PageTarget[] {
  const responders = respondersForLevel(level, now);
  if (responders.length > 0) return responders;
  return [{ handle: 'support mailbox', email: getHandoffConfig().fallbackEmail }];
}

function escalationNote(level: EscalationLevel, targets: readonly PageTarget[]): string {
  const names = targets.map((target) => target.handle).join(', ');
  return `Escalation level ${level} · notified: ${names}`;
}

/**
 * One place an incident reaches people: the responder the rotation says holds
 * the pager, the pager webhook, and the shared channel, with the level raised
 * every time the same condition survives another evaluation.
 */
export async function notifyIncident(
  notification: IncidentNotification,
  now: Date = new Date(),
): Promise<IncidentDispatchResult> {
  const level = await escalationLevel(notification.key, now);
  const targets = recipients(level, now);
  const text = `${notification.text}\n\n${escalationNote(level, targets)}`;
  const html = alertHtml(text);

  const [emails, paged, channel] = await Promise.all([
    Promise.all(
      targets.map((target) =>
        sendSupportEmail({ to: target.email, subject: notification.subject, text, html }),
      ),
    ),
    pageOnCall(
      notification.severity,
      notification.subject,
      text,
      targets[0],
      notification.source ?? notification.key,
    ),
    postToIncidentChannel(notification.severity, notification.subject, text, targets[0]),
  ]);

  const delivered = emails.some((sent) => sent.delivered);
  const reason = emails.find((sent) => !sent.delivered)?.reason;

  if (!delivered && paged !== 'paged' && channel !== 'paged') {
    logger.error(
      { key: notification.key, severity: notification.severity, level, reason },
      'Incident alert could NOT be delivered · no human has been told',
    );
  }

  return {
    level,
    notified: targets.map((target) => target.handle),
    delivery: delivered ? 'delivered' : 'undeliverable',
    paged,
    channel,
    ...(delivered ? {} : { reason }),
  };
}

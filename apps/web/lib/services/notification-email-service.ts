import 'server-only';

import { logger } from '@/lib/logger';
import { sendTransactionalEmail, type SendEmailResult } from '@/lib/support/handoff/resend-client';

/**
 * Product notification email.
 *
 * SCOPE — this deliberately covers ONE channel: a scheduled task finishing.
 * The backlog row that asked for email notifications listed six (task,
 * schedule, usage, budget, billing, security) and flagged that "billing and
 * security emails carry compliance stakes — scope per channel". Those are not
 * built here. A billing email is a financial notice with retention and
 * disclosure obligations, and a security email is the channel an attacker most
 * wants to suppress or spoof; neither should be added as a by-product of
 * wiring schedule notifications.
 *
 * What IS here is the channel with a real event and no compliance surface:
 * a schedule runs on the server, on its own clock, with nobody watching.
 *
 * SENDER IDENTITY. Uses `AGI_NOTIFICATIONS_FROM_EMAIL`, deliberately NOT the
 * support address. A product notification arriving from the support mailbox
 * trains users to reply where nobody is reading, and mixes deliverability
 * reputation between an address a human watches and one nobody does. Absent or
 * invalid, this fails closed and nothing is sent.
 */

function notificationsFromEmail(): string {
  return process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim() ?? '';
}

/** True when this deployment can send notification email at all. */
export function isNotificationEmailConfigured(): boolean {
  return Boolean(process.env['RESEND_API_KEY']?.trim()) && notificationsFromEmail().length > 0;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ScheduleEmailInput {
  to: string;
  taskName: string;
  status: 'success' | 'failed' | 'timeout';
  /** Absolute URL to the schedule. Omitted when the caller cannot build one. */
  scheduleUrl?: string;
}

/**
 * Tell a user their scheduled task finished.
 *
 * Returns rather than throws, matching every other notification path here: the
 * run is already durable by the time this is called, and an email provider
 * outage must not change the recorded outcome of the work.
 *
 * The body carries NO task output. A scheduled run can produce anything, and
 * email is neither access-controlled nor revocable once sent — the notification
 * says that something finished and links to where the result actually lives.
 */
export async function sendScheduleCompletionEmail(
  input: ScheduleEmailInput,
): Promise<SendEmailResult> {
  const from = notificationsFromEmail();
  if (!isNotificationEmailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are required',
    };
  }

  const succeeded = input.status === 'success';
  const verb = succeeded ? 'completed' : input.status === 'timeout' ? 'timed out' : 'failed';
  const subject = succeeded
    ? `Scheduled task completed: ${input.taskName}`
    : `Scheduled task ${verb}: ${input.taskName}`;

  const lines = [
    `Your scheduled task “${input.taskName}” ${verb}.`,
    '',
    ...(input.scheduleUrl ? [`View the run: ${input.scheduleUrl}`, ''] : []),
    'You are receiving this because you enabled schedule notifications in Settings.',
  ];

  const result = await sendTransactionalEmail({
    from,
    to: input.to,
    subject,
    text: lines.join('\n'),
    html: [
      `<p>Your scheduled task &ldquo;${escapeHtml(input.taskName)}&rdquo; ${verb}.</p>`,
      input.scheduleUrl ? `<p><a href="${escapeHtml(input.scheduleUrl)}">View the run</a></p>` : '',
      '<p style="color:#666;font-size:12px">You are receiving this because you enabled schedule notifications in Settings.</p>',
    ]
      .filter(Boolean)
      .join(''),
  });

  if (!result.delivered && result.reason !== 'not_configured') {
    logger.warn({ reason: result.reason }, '[notifications] schedule email failed to send');
  }
  return result;
}

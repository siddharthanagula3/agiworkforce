import 'server-only';

import { logger } from '@/lib/logger';
import { sendTransactionalEmail, type SendEmailResult } from '@/lib/support/handoff/resend-client';

function notificationsFromEmail(): string {
  return process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim() ?? '';
}

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
  scheduleUrl?: string;
}

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

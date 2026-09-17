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

export interface SpendAlertEmailInput {
  to: string;
  workspaceName: string;
  kind: 'threshold' | 'cap';
  enforcement: 'notify' | 'block';
  spent: string;
  cap: string;
  thresholdPct: number;
  idempotencyKey: string;
}

export async function sendSpendAlertEmail(input: SpendAlertEmailInput): Promise<SendEmailResult> {
  const from = notificationsFromEmail();
  if (!isNotificationEmailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are required',
    };
  }

  const reachedCap = input.kind === 'cap';
  const subject = reachedCap
    ? `${input.workspaceName} reached its monthly spend limit`
    : `${input.workspaceName} passed ${input.thresholdPct}% of its monthly spend limit`;
  const headline = reachedCap
    ? `${input.workspaceName} has spent ${input.spent} this month, reaching its ${input.cap} limit.`
    : `${input.workspaceName} has spent ${input.spent} this month, past ${input.thresholdPct}% of its ${input.cap} limit.`;
  const consequence =
    reachedCap && input.enforcement === 'block'
      ? 'Managed Cloud requests from members are now refused until an owner or admin raises the limit or the month resets.'
      : 'Members can keep working. The limit is set to notify, so nothing is refused.';
  const action = 'Review or change the limit in the workspace console under Spend limit.';
  const footer = 'You are receiving this because you are an owner or admin of this workspace.';

  const result = await sendTransactionalEmail({
    from,
    to: input.to,
    subject,
    text: [headline, '', consequence, '', action, '', footer].join('\n'),
    html: [
      `<p>${escapeHtml(headline)}</p>`,
      `<p>${escapeHtml(consequence)}</p>`,
      `<p>${escapeHtml(action)}</p>`,
      `<p style="font-size:12px">${escapeHtml(footer)}</p>`,
    ].join(''),
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.delivered && result.reason !== 'not_configured') {
    logger.warn({ reason: result.reason }, '[notifications] spend alert email failed to send');
  }
  return result;
}

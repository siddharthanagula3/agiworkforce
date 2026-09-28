import 'server-only';

import { logger } from '@/lib/logger';
import { sendTransactionalEmail, type SendEmailResult } from '@/lib/support/handoff/resend-client';

export const TRANSACTIONAL_EMAIL_FOOTER_STYLE = 'color:#666;font-size:12px';

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
  status: 'success' | 'failed' | 'timeout' | 'awaiting_approval';
  approvalSummary?: string;
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
  const awaitingApproval = input.status === 'awaiting_approval';
  const verb = succeeded ? 'completed' : input.status === 'timeout' ? 'timed out' : 'failed';
  const subject = awaitingApproval
    ? `Scheduled task needs your approval: ${input.taskName}`
    : succeeded
      ? `Scheduled task completed: ${input.taskName}`
      : `Scheduled task ${verb}: ${input.taskName}`;
  const statement = awaitingApproval
    ? `Your scheduled task “${input.taskName}” is paused until you approve or deny its next step${input.approvalSummary ? `: ${input.approvalSummary}` : ''}. Open Schedules to review it.`
    : `Your scheduled task “${input.taskName}” ${verb}.`;

  const lines = [
    statement,
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
      `<p>${escapeHtml(statement)}</p>`,
      input.scheduleUrl ? `<p><a href="${escapeHtml(input.scheduleUrl)}">View the run</a></p>` : '',
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">You are receiving this because you enabled schedule notifications in Settings.</p>`,
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
    ? `${input.workspaceName} has used ${input.spent} this month, reaching its limit of ${input.cap}.`
    : `${input.workspaceName} has used ${input.spent} this month, past ${input.thresholdPct}% of its limit of ${input.cap}.`;
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

export interface SecurityAlertEmailInput {
  to: string;
  title: string;
  message: string;
  settingsUrl: string;
  idempotencyKey: string;
}

export async function sendSecurityAlertEmail(
  input: SecurityAlertEmailInput,
): Promise<SendEmailResult> {
  const from = notificationsFromEmail();
  if (!isNotificationEmailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are required',
    };
  }

  const footer =
    'Security alerts are sent even during quiet hours. You can stop the emails in Settings, Notifications; the alert still appears in the app.';
  const result = await sendTransactionalEmail({
    from,
    to: input.to,
    subject: input.title,
    text: [input.message, '', `Review your account: ${input.settingsUrl}`, '', footer].join('\n'),
    html: [
      `<p>${escapeHtml(input.message)}</p>`,
      `<p><a href="${escapeHtml(input.settingsUrl)}">Review your account</a></p>`,
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${escapeHtml(footer)}</p>`,
    ].join(''),
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.delivered && result.reason !== 'not_configured') {
    logger.warn({ reason: result.reason }, '[notifications] security alert email failed to send');
  }
  return result;
}

export interface AccountSecurityCodeEmailInput {
  to: string;
  code: string;
  expiresMinutes: number;
  idempotencyKey: string;
}

export async function sendAccountSecurityCodeEmail(
  input: AccountSecurityCodeEmailInput,
): Promise<SendEmailResult> {
  const from = notificationsFromEmail();
  if (!isNotificationEmailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are required',
    };
  }

  const paragraphs = [
    `Your code to turn on Advanced Account Security is ${input.code}.`,
    `It works once and expires in ${input.expiresMinutes} minutes.`,
    'If you did not ask for this code, someone may know your password. Change your password now.',
  ];
  const result = await sendTransactionalEmail({
    from,
    to: input.to,
    subject: 'Your code to turn on Advanced Account Security',
    text: paragraphs.join('\n\n'),
    html: paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(''),
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.delivered && result.reason !== 'not_configured') {
    logger.warn({ reason: result.reason }, '[notifications] account security code email failed');
  }
  return result;
}

export interface AccountSecurityEnabledEmailInput {
  to: string;
  undoUrl: string;
  undoExpiresAt: string;
  idempotencyKey: string;
}

export async function sendAccountSecurityEnabledEmail(
  input: AccountSecurityEnabledEmailInput,
): Promise<SendEmailResult> {
  const from = notificationsFromEmail();
  if (!isNotificationEmailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are required',
    };
  }

  const summary =
    'Advanced Account Security was turned on for your AGI Workforce account. Every sign-in now needs one of the passkeys or security keys that were added, and your other devices were signed out.';
  const undo = `If this was not you, turn it off with the link below. It signs everyone out and resets your password, and it does not need a passkey. It works until ${input.undoExpiresAt}. Afterwards, choose a new password with Forgot password on the sign-in screen.`;
  const ignore = 'If it was you, you can ignore this email.';
  const result = await sendTransactionalEmail({
    from,
    to: input.to,
    subject: 'Was this you? Advanced Account Security was turned on',
    text: [summary, '', undo, input.undoUrl, '', ignore].join('\n'),
    html: [
      `<p>${escapeHtml(summary)}</p>`,
      `<p>${escapeHtml(undo)}</p>`,
      `<p><a href="${escapeHtml(input.undoUrl)}">This was not me: turn it off</a></p>`,
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${escapeHtml(ignore)}</p>`,
    ].join(''),
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.delivered && result.reason !== 'not_configured') {
    logger.warn({ reason: result.reason }, '[notifications] account security undo email failed');
  }
  return result;
}

export interface DataExportReadyEmailInput {
  to: string;
  downloadUrls: readonly string[];
  expiresAt: string;
  idempotencyKey: string;
}

export async function sendDataExportReadyEmail(
  input: DataExportReadyEmailInput,
): Promise<SendEmailResult> {
  const from = notificationsFromEmail();
  if (!isNotificationEmailConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL are required',
    };
  }

  const partCount = input.downloadUrls.length;
  const links = input.downloadUrls.map((url, index) => ({
    url,
    label: partCount === 1 ? 'Download your export' : `Download part ${index + 1} of ${partCount}`,
  }));
  const statement =
    partCount === 1
      ? 'Your data export is ready. It holds your account data and the files you stored with us.'
      : `Your data export is ready in ${partCount} parts. Together they hold your account data and the files you stored with us.`;
  const expiry = `The ${partCount === 1 ? 'link expires' : 'links expire'} on ${new Date(input.expiresAt).toUTCString()}. After that, request a new export from Settings.`;
  const footer = 'You are receiving this because you requested a data export.';

  const result = await sendTransactionalEmail({
    from,
    to: input.to,
    subject: 'Your data export is ready',
    text: [
      statement,
      '',
      ...links.map((link) => `${link.label}: ${link.url}`),
      '',
      expiry,
      '',
      footer,
    ].join('\n'),
    html: [
      `<p>${escapeHtml(statement)}</p>`,
      ...links.map(
        (link) => `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`,
      ),
      `<p>${escapeHtml(expiry)}</p>`,
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${escapeHtml(footer)}</p>`,
    ].join(''),
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.delivered && result.reason !== 'not_configured') {
    logger.warn({ reason: result.reason }, '[notifications] data export email failed to send');
  }
  return result;
}

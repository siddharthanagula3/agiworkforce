import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import {
  isNotificationEmailConfigured,
  TRANSACTIONAL_EMAIL_FOOTER_STYLE,
} from '@/lib/services/notification-email-service';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';

export interface InvitationDelivery {
  emailSent: boolean;
  reason?: string;
}

export interface InvitationEmailInput {
  to: string;
  token: string;
  role: string;
  organizationName: string | null;
  expiresAt: string;
  replacesPreviousLink?: boolean;
}

const MANUAL_DELIVERY =
  'Send this link to the invited address yourself; it expires with the invitation.';

const MANUAL_DELIVERY_AFTER_RESEND = 'The previous link is now invalid; send this one instead.';

/**
 * Built from the configured application URL alone, never from the request's
 * Origin header: the header is whatever the caller sent, and a link in an email
 * this product sends must not be able to point at someone else's host.
 *
 * The token rides in the fragment, which is where the acceptance page reads it
 * from and the only part of a URL a server, a proxy log or a Referer header
 * never receives.
 */
function inviteUrl(token: string): string | null {
  const configured = (process.env['NEXT_PUBLIC_APP_URL'] ?? '').trim().replace(/\/$/, '');
  if (!configured) return null;
  return `${configured}/invite#token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function readOrganizationName(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<string | null> {
  try {
    const [row] = await db.query<{ name: string | null }>(
      `select name from public.organizations where id = $1 limit 1`,
      [organizationId],
    );
    return row?.name ?? null;
  } catch (error) {
    logger.warn({ error }, '[team-invitations] workspace name could not be read for the invite');
    return null;
  }
}

function workspaceLabel(name: string | null): string {
  return name?.trim() ? name.trim() : 'an AGI workspace';
}

export async function sendInvitationEmail(
  input: InvitationEmailInput,
): Promise<InvitationDelivery> {
  const manualReason = input.replacesPreviousLink ? MANUAL_DELIVERY_AFTER_RESEND : MANUAL_DELIVERY;

  const from = process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim() ?? '';
  if (!isNotificationEmailConfigured()) {
    return {
      emailSent: false,
      reason: `No transactional email provider is configured. ${manualReason}`,
    };
  }

  const url = inviteUrl(input.token);
  if (!url) {
    return {
      emailSent: false,
      reason: `This deployment has no application URL configured, so no invitation link could be built. ${manualReason}`,
    };
  }

  const workspace = workspaceLabel(input.organizationName);
  const expires = new Date(input.expiresAt);
  const expiresLabel = Number.isNaN(expires.getTime())
    ? 'soon'
    : expires.toISOString().slice(0, 10);

  const subject = `You have been invited to ${workspace}`;
  const text = [
    `You have been invited to join ${workspace} as a ${input.role}.`,
    '',
    `Accept the invitation: ${url}`,
    '',
    `The link expires on ${expiresLabel} and only works for ${input.to}.`,
    input.replacesPreviousLink ? 'Any earlier link for this invitation no longer works.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = [
    `<p>You have been invited to join ${escapeHtml(workspace)} as a ${escapeHtml(input.role)}.</p>`,
    `<p><a href="${escapeHtml(url)}">Accept the invitation</a></p>`,
    `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">The link expires on ${escapeHtml(expiresLabel)} and only works for ${escapeHtml(input.to)}.</p>`,
    input.replacesPreviousLink
      ? `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">Any earlier link for this invitation no longer works.</p>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const result = await sendTransactionalEmail({ from, to: input.to, subject, text, html });

  if (result.delivered) return { emailSent: true };

  logger.warn({ reason: result.reason }, '[team-invitations] invitation email failed to send');
  return {
    emailSent: false,
    reason: `The invitation email could not be delivered (${result.reason}). ${manualReason}`,
  };
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { isNotificationEmailConfigured } from '@/lib/services/notification-email-service';
import { recordNotification } from '@/lib/services/notification-service';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';
import type { NotificationTarget } from '@/features/notifications/lib/notification-target';

export interface BillingNotice {
  userId: string;
  title: string;
  message: string;
  target: NotificationTarget;
  dedupeKey: string;
  action?: { label: string; url: string };
}

export interface BillingNoticeResult {
  recorded: boolean;
  emailed: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readProfileEmail(db: DatabaseAdapter, userId: string): Promise<string | null> {
  const [profile] = await db.query<{ email: string | null }>(
    'select email from public.profiles where id = $1 limit 1',
    [userId],
  );
  return profile?.email?.trim() || null;
}

function billingNoticeSender(): string | null {
  const from = process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim();
  return from && isNotificationEmailConfigured() ? from : null;
}

export function isBillingNoticeEmailConfigured(): boolean {
  return billingNoticeSender() !== null;
}

export async function sendBillingNotice(
  db: DatabaseAdapter,
  notice: BillingNotice,
): Promise<BillingNoticeResult> {
  const { recorded } = await recordNotification(db, {
    userId: notice.userId,
    category: 'billing',
    severity: 'info',
    title: notice.title,
    message: notice.message,
    target: notice.target,
    dedupeKey: notice.dedupeKey,
  });

  const from = billingNoticeSender();
  const to = await readProfileEmail(db, notice.userId);
  if (!to || !from) {
    logger.warn(
      { userId: notice.userId, dedupeKey: notice.dedupeKey },
      'Billing notice recorded in the app only; no email address or sender is configured',
    );
    return { recorded, emailed: false };
  }

  const actionText = notice.action ? `\n\n${notice.action.label}: ${notice.action.url}` : '';
  const actionHtml = notice.action
    ? `<p><a href="${escapeHtml(notice.action.url)}">${escapeHtml(notice.action.label)}</a></p>`
    : '';
  const result = await sendTransactionalEmail({
    from,
    to,
    subject: notice.title,
    text: `${notice.message}${actionText}`,
    html: `<p>${escapeHtml(notice.message)}</p>${actionHtml}`,
    idempotencyKey: notice.dedupeKey,
  });
  if (!result.delivered) {
    logger.warn(
      { userId: notice.userId, dedupeKey: notice.dedupeKey, reason: result.reason },
      'Billing notice email was not delivered',
    );
  }
  return { recorded, emailed: result.delivered };
}

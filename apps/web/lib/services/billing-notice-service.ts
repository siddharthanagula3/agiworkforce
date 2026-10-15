import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CONTACT_EMAIL,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  UNSUBSCRIBE_SUBJECT,
  contactMailto,
} from '@/lib/legal-constants';
import { logger } from '@/lib/logger';
import {
  TRANSACTIONAL_EMAIL_FOOTER_STYLE,
  isNotificationEmailConfigured,
} from '@/lib/services/notification-email-service';
import {
  insertNotification,
  recordNotification,
  type NotificationInput,
} from '@/lib/services/notification-service';
import { sendTransactionalEmail, type SendEmailResult } from '@/lib/support/handoff/resend-client';
import type { NotificationTarget } from '@/features/notifications/lib/notification-target';

export interface BillingNotice {
  userId: string;
  title: string;
  message: string;
  target: NotificationTarget;
  dedupeKey: string;
  action?: { label: string; url: string };
  promotion?: { reason: string };
}

export interface BillingNoticeResult {
  recorded: boolean;
  emailed: boolean;
}

const UNSUBSCRIBE_URL = contactMailto(UNSUBSCRIBE_SUBJECT);
const PROMOTION_OPT_OUT = `To get no more emails like this, reply with the word unsubscribe or write to ${CONTACT_EMAIL}.`;
const SENDER_ADDRESS = `${LEGAL_ENTITY}, ${NOTICE_ADDRESS}`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function footerParagraph(html: string): string {
  return `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${html}</p>`;
}

function promotionEmail(promotion: BillingNotice['promotion']) {
  if (!promotion) return { text: [], html: '', delivery: {} };
  return {
    text: [promotion.reason, PROMOTION_OPT_OUT, SENDER_ADDRESS],
    html: [
      footerParagraph(escapeHtml(promotion.reason)),
      footerParagraph(
        `${escapeHtml(PROMOTION_OPT_OUT)} <a href="${escapeHtml(UNSUBSCRIBE_URL)}">Unsubscribe</a>`,
      ),
      footerParagraph(escapeHtml(SENDER_ADDRESS)),
    ].join(''),
    delivery: {
      replyTo: CONTACT_EMAIL,
      headers: { 'List-Unsubscribe': `<${UNSUBSCRIBE_URL}>` },
    },
  };
}

export async function readProfileEmail(
  db: DatabaseAdapter,
  userId: string,
): Promise<string | null> {
  const [profile] = await db.query<{ email: string | null }>(
    'select email from public.profiles where id = $1 limit 1',
    [userId],
  );
  return profile?.email?.trim() || null;
}

function billingNotification(notice: BillingNotice): NotificationInput {
  return {
    userId: notice.userId,
    category: 'billing',
    severity: 'info',
    title: notice.title,
    message: notice.message,
    target: notice.target,
    dedupeKey: notice.dedupeKey,
  };
}

export async function recordBillingNotice(
  db: DatabaseAdapter,
  notice: BillingNotice,
): Promise<void> {
  if ((await insertNotification(db, billingNotification(notice))) === 'invalid') {
    throw new Error('A billing notice needs an account and a title before it can be recorded.');
  }
}

function billingNoticeSender(): string | null {
  const from = process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim();
  return from && isNotificationEmailConfigured() ? from : null;
}

export function isBillingNoticeEmailConfigured(): boolean {
  return billingNoticeSender() !== null;
}

export async function emailBillingNotice(
  db: DatabaseAdapter,
  notice: BillingNotice,
): Promise<SendEmailResult | null> {
  const from = billingNoticeSender();
  const to = await readProfileEmail(db, notice.userId);
  if (!to || !from) return null;

  const actionText = notice.action ? `\n\n${notice.action.label}: ${notice.action.url}` : '';
  const actionHtml = notice.action
    ? `<p><a href="${escapeHtml(notice.action.url)}">${escapeHtml(notice.action.label)}</a></p>`
    : '';
  const promotion = promotionEmail(notice.promotion);
  return sendTransactionalEmail({
    from,
    to,
    subject: notice.title,
    text: [`${notice.message}${actionText}`, ...promotion.text].join('\n\n'),
    html: `<p>${escapeHtml(notice.message)}</p>${actionHtml}${promotion.html}`,
    idempotencyKey: notice.dedupeKey,
    ...promotion.delivery,
  });
}

export async function sendBillingNotice(
  db: DatabaseAdapter,
  notice: BillingNotice,
): Promise<BillingNoticeResult> {
  const { recorded } = await recordNotification(db, billingNotification(notice));
  const result = await emailBillingNotice(db, notice);
  if (!result) {
    logger.warn(
      { userId: notice.userId, dedupeKey: notice.dedupeKey },
      'Billing notice recorded in the app only; no email address or sender is configured',
    );
    return { recorded, emailed: false };
  }
  if (!result.delivered) {
    logger.warn(
      { userId: notice.userId, dedupeKey: notice.dedupeKey, reason: result.reason },
      'Billing notice email was not delivered',
    );
  }
  return { recorded, emailed: result.delivered };
}

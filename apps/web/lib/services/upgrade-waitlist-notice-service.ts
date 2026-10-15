import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { SELF_SERVE_PAID_PLAN_TIERS, getBillingPlanPricing } from '@agiworkforce/types';
import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import { PRODUCT_NAME } from '@/lib/legal-constants';
import { logger } from '@/lib/logger';
import { absoluteUrl } from '@/lib/seo/site';
import { billingUpgradesOpenFor } from '@/lib/server/billing-waitlist-access';
import {
  emailBillingNotice,
  recordBillingNotice,
  type BillingNotice,
} from '@/lib/services/billing-notice-service';
import { isNotificationEmailConfigured } from '@/lib/services/notification-email-service';
import type { SendEmailResult } from '@/lib/support/handoff/resend-client';

export const UPGRADE_WAITLIST_OPEN_NOTICE = 'upgrade-waitlist-open:';

export const EMAIL_RETRY_BASE_MINUTES = 15;
export const MAX_EMAIL_ATTEMPTS = 8;

const SENDER_REFUSED_STATUSES: ReadonlySet<number> = new Set([401, 403, 404, 405]);
const RECIPIENT_RETRY_STATUSES: ReadonlySet<number> = new Set([409]);
const PROVIDER_BUSY_STATUSES: ReadonlySet<number> = new Set([429]);
const SERVER_ERROR_STATUS_MIN = 500;

const PLAN_LIST = new Intl.ListFormat('en', { style: 'long', type: 'disjunction' });

export type UpgradeWaitlistEmailChannel = 'available' | 'not_configured' | 'refused' | 'paused';

export interface UpgradeWaitlistNoticeSummary {
  notified: number;
  emailed: number;
  undeliverable: number;
  deferred: number;
  remaining: boolean;
  emailChannel: UpgradeWaitlistEmailChannel;
  skipped?: 'waitlist_closed';
}

interface WaitlistedAccount {
  user_id: string;
  plans: string[];
  notified: boolean;
  email_attempts: number;
}

type EmailOutcome =
  | { kind: 'delivered' }
  | { kind: 'undeliverable'; failure: string }
  | { kind: 'retry'; failure: string; pause: boolean }
  | { kind: 'refused'; failure: string };

function upgradeOpenNotice(account: WaitlistedAccount): BillingNotice {
  const labels = SELF_SERVE_PAID_PLAN_TIERS.filter((plan) => account.plans.includes(plan)).map(
    (plan) => getBillingPlanPricing(plan).label,
  );
  const plans = labels.length > 0 ? PLAN_LIST.format(labels) : null;
  const waitlist = plans
    ? `${PRODUCT_NAME} waitlist for ${plans}`
    : `${PRODUCT_NAME} upgrade waitlist`;
  return {
    userId: account.user_id,
    title: plans ? `You can now upgrade to ${plans}` : 'Paid upgrades are open',
    message: plans
      ? `Paid upgrades are open on ${PRODUCT_NAME}. You joined the waitlist for ${plans}, and you can upgrade now.`
      : `Paid upgrades are open on ${PRODUCT_NAME}, and you can upgrade now.`,
    target: { kind: 'settings', id: 'billing' },
    dedupeKey: `${UPGRADE_WAITLIST_OPEN_NOTICE}${account.user_id}`,
    action: { label: 'See plans', url: absoluteUrl('/pricing') },
    promotion: {
      reason: `You are receiving this because you joined the ${waitlist}. It is the only email about that waitlist.`,
    },
  };
}

function sendFailure(result: Extract<SendEmailResult, { delivered: false }>): string {
  return result.status === undefined ? result.reason : `${result.reason} ${result.status}`;
}

function emailOutcome(result: SendEmailResult | null): EmailOutcome {
  if (!result) return { kind: 'undeliverable', failure: 'no_address' };
  if (result.delivered) return { kind: 'delivered' };
  const failure = sendFailure(result);
  if (result.reason === 'invalid_recipient') return { kind: 'undeliverable', failure };
  if (result.reason === 'not_configured') return { kind: 'refused', failure };
  if (result.reason !== 'rejected' || result.status === undefined) {
    return { kind: 'retry', failure, pause: true };
  }
  if (SENDER_REFUSED_STATUSES.has(result.status)) return { kind: 'refused', failure };
  if (RECIPIENT_RETRY_STATUSES.has(result.status)) return { kind: 'retry', failure, pause: false };
  if (PROVIDER_BUSY_STATUSES.has(result.status) || result.status >= SERVER_ERROR_STATUS_MIN) {
    return { kind: 'retry', failure, pause: true };
  }
  return { kind: 'undeliverable', failure };
}

async function tellInApp(db: DatabaseAdapter, notice: BillingNotice): Promise<void> {
  await recordBillingNotice(db, notice);
  await db.execute(
    `update public.waitlist
        set upgrade_notified_at = now()
      where user_id = $1
        and upgrade_notified_at is null`,
    [notice.userId],
  );
}

async function resolveEmail(
  db: DatabaseAdapter,
  userId: string,
  failure: string | null,
): Promise<void> {
  await db.execute(
    `update public.waitlist
        set upgrade_emailed_at = now(),
            upgrade_email_failure = $2
      where user_id = $1`,
    [userId, failure],
  );
}

async function recordEmailAttempt(
  db: DatabaseAdapter,
  userId: string,
  attempts: number,
  failure: string,
): Promise<void> {
  await db.execute(
    `update public.waitlist
        set upgrade_email_attempts = $2,
            upgrade_email_attempted_at = now(),
            upgrade_email_failure = $3
      where user_id = $1`,
    [userId, attempts, failure],
  );
}

async function emailAccount(
  db: DatabaseAdapter,
  account: WaitlistedAccount,
  notice: BillingNotice,
  summary: UpgradeWaitlistNoticeSummary,
): Promise<void> {
  const outcome = emailOutcome(await emailBillingNotice(db, notice));
  if (outcome.kind === 'delivered') {
    await resolveEmail(db, account.user_id, null);
    summary.emailed += 1;
    return;
  }
  if (outcome.kind === 'refused') {
    summary.emailChannel = 'refused';
    logger.error(
      { userId: account.user_id, failure: outcome.failure },
      'The email provider refused the upgrade waitlist sender; no account was marked, the next run tries again',
    );
    return;
  }
  const attempts = account.email_attempts + 1;
  if (outcome.kind === 'undeliverable' || attempts >= MAX_EMAIL_ATTEMPTS) {
    await resolveEmail(db, account.user_id, outcome.failure);
    summary.undeliverable += 1;
    logger.warn(
      { userId: account.user_id, failure: outcome.failure, attempts },
      'Upgrade waitlist email given up; the account was told in the app',
    );
    return;
  }
  await recordEmailAttempt(db, account.user_id, attempts, outcome.failure);
  summary.deferred += 1;
  if (outcome.pause) summary.emailChannel = 'paused';
}

export async function notifyUpgradeWaitlist(
  db: DatabaseAdapter,
  maxNotices: number,
): Promise<UpgradeWaitlistNoticeSummary> {
  const emailConfigured = isNotificationEmailConfigured();
  const summary: UpgradeWaitlistNoticeSummary = {
    notified: 0,
    emailed: 0,
    undeliverable: 0,
    deferred: 0,
    remaining: false,
    emailChannel: emailConfigured ? 'available' : 'not_configured',
  };

  const due = await db.query<WaitlistedAccount>(
    `select waitlisted.user_id,
            array_agg(distinct waitlisted.plan) as plans,
            count(waitlisted.upgrade_notified_at) > 0 as notified,
            max(waitlisted.upgrade_email_attempts) as email_attempts
       from public.waitlist waitlisted
      where ${ownerMayRunUnattendedSql('waitlisted.user_id', 4)}
        and not exists (
              select 1
                from public.beta_redemptions redemption
               where redemption.user_id = waitlisted.user_id
            )
      group by waitlisted.user_id
     having count(waitlisted.upgrade_notified_at) = 0
         or ($1::boolean
             and count(waitlisted.upgrade_emailed_at) = 0
             and (max(waitlisted.upgrade_email_attempted_at) is null
                  or max(waitlisted.upgrade_email_attempted_at) <= now() - make_interval(
                       mins => $2::int * power(2, max(waitlisted.upgrade_email_attempts) - 1)::int)))
      order by count(waitlisted.upgrade_notified_at) > 0,
               max(waitlisted.upgrade_email_attempted_at) nulls first,
               min(coalesce(waitlisted.joined_at, waitlisted.created_at))
      limit $3`,
    [emailConfigured, EMAIL_RETRY_BASE_MINUTES, maxNotices + 1, UNATTENDED_RUN_DENIED_STATUSES],
  );

  const batch = due.slice(0, maxNotices);
  const open: WaitlistedAccount[] = [];
  for (const account of batch) {
    if (await billingUpgradesOpenFor(account.user_id)) open.push(account);
  }
  if (batch.length > 0 && open.length === 0) return { ...summary, skipped: 'waitlist_closed' };

  summary.remaining = due.length > maxNotices;
  for (const account of open) {
    const notice = upgradeOpenNotice(account);
    try {
      if (!account.notified) {
        await tellInApp(db, notice);
        summary.notified += 1;
      }
      if (summary.emailChannel === 'available') await emailAccount(db, account, notice, summary);
    } catch (error) {
      summary.deferred += 1;
      logger.error(
        { error, userId: account.user_id },
        'Upgrade waitlist notice failed for an account',
      );
    }
  }
  return summary;
}

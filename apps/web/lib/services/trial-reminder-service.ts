import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { absoluteUrl } from '@/lib/seo/site';
import { sendBillingNotice } from '@/lib/services/billing-notice-service';
import {
  readTrialCancelToken,
  trialCancelUrl,
  type TrialCancelLink,
} from '@/lib/services/trial-cancel-link';
import type { Stripe } from '@/lib/stripe-types';

export const TRIAL_REMINDER_DAYS = 2;

const TRIAL_ENDING_NOTICE = 'trial-ending:';
const TRIAL_CANCELLED_NOTICE = 'trial-cancelled:';
const DAY_MS = 86_400_000;

export interface TrialReminderSummary {
  reminded: number;
  skipped: number;
  failed: number;
  remaining: boolean;
}

export type TrialCancellation =
  | { state: 'invalid' }
  | { state: 'ended' }
  | { state: 'cancelled'; plan: string; endsOn: string }
  | { state: 'trialing'; plan: string; endsOn: string; token: string };

export type TrialCancelOutcome =
  | { state: 'invalid' }
  | { state: 'ended' }
  | {
      state: 'cancelled';
      plan: string;
      endsAt: string;
      userId: string;
      subscriptionId: string;
      planTier: string;
      changed: boolean;
    };

type TrialReminderOutcome = 'reminded' | 'skipped' | 'unsent';

interface ConvertingTrial {
  user_id: string;
  stripe_subscription_id: string;
  plan_tier: string;
}

interface LinkedTrial {
  plan_tier: string;
  status: string;
  cancel_at_period_end: boolean | null;
}

export function formatChargeAmount(amountMinor: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const amount = amountMinor / 10 ** digits;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatTrialEnd(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function formatDay(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isCancelledBeforeCharge(subscription: Stripe.Subscription): boolean {
  if (subscription.cancel_at_period_end) return true;
  return (
    subscription.cancel_at !== null &&
    subscription.trial_end !== null &&
    subscription.cancel_at <= subscription.trial_end
  );
}

async function remindTrial(
  db: DatabaseAdapter,
  stripe: Stripe,
  trial: ConvertingTrial,
): Promise<TrialReminderOutcome> {
  const subscription = await stripe.subscriptions.retrieve(trial.stripe_subscription_id);
  const trialEnd = subscription.trial_end;
  if (
    subscription.status !== 'trialing' ||
    !trialEnd ||
    isCancelledBeforeCharge(subscription) ||
    trialEnd * 1000 > Date.now() + TRIAL_REMINDER_DAYS * DAY_MS
  ) {
    return 'skipped';
  }

  const preview = await stripe.invoices.createPreview({ subscription: subscription.id });
  const plan = getBillingPlanPricing(trial.plan_tier).label;
  const interval =
    subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'year' : 'month';
  const cancelUrl = trialCancelUrl({
    userId: trial.user_id,
    subscriptionId: subscription.id,
    trialEnd,
  });
  if (!cancelUrl) {
    logger.error(
      { userId: trial.user_id, subscriptionId: subscription.id },
      'Trial cancel links cannot be signed; the reminder links to Settings > Billing instead',
    );
  }

  const { recorded, emailed } = await sendBillingNotice(db, {
    userId: trial.user_id,
    title: `Your ${plan} trial ends on ${formatDay(trialEnd)}`,
    message:
      `Your free ${plan} trial ends on ${formatTrialEnd(trialEnd)}. At that time your card is ` +
      `charged ${formatChargeAmount(preview.amount_due, preview.currency)}, and again every ` +
      `${interval} until you cancel. Cancel before then and you will not be charged. You can ` +
      'also cancel in Settings > Billing.',
    target: { kind: 'settings', id: 'billing' },
    dedupeKey: `${TRIAL_ENDING_NOTICE}${subscription.id}`,
    action: cancelUrl
      ? { label: 'Cancel your trial', url: cancelUrl }
      : { label: 'Manage your plan', url: absoluteUrl('/settings/billing') },
  });
  if (!emailed) {
    logger.error(
      { userId: trial.user_id, subscriptionId: subscription.id, recorded },
      'Trial reminder was not emailed; a reminder recorded in the app is not sent again',
    );
    return 'unsent';
  }
  return 'reminded';
}

export async function remindConvertingTrials(
  db: DatabaseAdapter,
  stripe: Stripe,
  maxReminders: number,
): Promise<TrialReminderSummary> {
  const due = await db.query<ConvertingTrial>(
    `select subscription_row.user_id, subscription_row.stripe_subscription_id,
            subscription_row.plan_tier
       from public.subscriptions subscription_row
      where subscription_row.status = 'trialing'
        and subscription_row.stripe_subscription_id is not null
        and subscription_row.cancel_at_period_end is not true
        and subscription_row.current_period_end > now()
        and subscription_row.current_period_end <= now() + make_interval(days => $1)
        and not exists (
              select 1
                from public.notifications notice
               where notice.user_id = subscription_row.user_id
                 and notice.dedupe_key = $2::text || subscription_row.stripe_subscription_id
            )
      order by subscription_row.current_period_end
      limit $3`,
    [TRIAL_REMINDER_DAYS, TRIAL_ENDING_NOTICE, maxReminders + 1],
  );
  const summary: TrialReminderSummary = {
    reminded: 0,
    skipped: 0,
    failed: 0,
    remaining: due.length > maxReminders,
  };
  for (const trial of due.slice(0, maxReminders)) {
    try {
      const outcome = await remindTrial(db, stripe, trial);
      if (outcome === 'reminded') summary.reminded += 1;
      else if (outcome === 'skipped') summary.skipped += 1;
      else summary.failed += 1;
    } catch (error) {
      summary.failed += 1;
      logger.error(
        { error, userId: trial.user_id, subscriptionId: trial.stripe_subscription_id },
        'Trial reminder failed for a subscription',
      );
    }
  }
  return summary;
}

async function readLinkedTrial(
  db: DatabaseAdapter,
  link: TrialCancelLink,
): Promise<LinkedTrial | null> {
  const [row] = await db.query<LinkedTrial>(
    `select subscription_row.plan_tier, subscription_row.status,
            subscription_row.cancel_at_period_end
       from public.subscriptions subscription_row
      where subscription_row.user_id = $1
        and subscription_row.stripe_subscription_id = $2
      limit 1`,
    [link.userId, link.subscriptionId],
  );
  return row ?? null;
}

export async function readTrialCancellation(
  openDb: () => DatabaseAdapter,
  token: string | null,
): Promise<TrialCancellation> {
  const link = readTrialCancelToken(token);
  if (!token || !link) return { state: 'invalid' };
  const trial = await readLinkedTrial(openDb(), link);
  if (!trial) return { state: 'invalid' };
  if (trial.status !== 'trialing') return { state: 'ended' };
  const plan = getBillingPlanPricing(trial.plan_tier).label;
  const endsOn = formatTrialEnd(link.trialEnd);
  return trial.cancel_at_period_end
    ? { state: 'cancelled', plan, endsOn }
    : { state: 'trialing', plan, endsOn, token };
}

async function confirmTrialCancelled(
  db: DatabaseAdapter,
  link: TrialCancelLink,
  plan: string,
  trialEnd: number,
): Promise<void> {
  try {
    await sendBillingNotice(db, {
      userId: link.userId,
      title: `Your ${plan} trial is cancelled`,
      message:
        `You will not be charged. ${plan} stays on until ${formatTrialEnd(trialEnd)}, then ` +
        'your account moves to the Free plan.',
      target: { kind: 'settings', id: 'billing' },
      dedupeKey: `${TRIAL_CANCELLED_NOTICE}${link.subscriptionId}`,
    });
  } catch (error) {
    logger.error(
      { error, userId: link.userId, subscriptionId: link.subscriptionId },
      'Trial cancelled; its confirmation notice could not be sent',
    );
  }
}

export async function cancelTrialFromLink(
  db: DatabaseAdapter,
  stripe: Stripe,
  token: string,
): Promise<TrialCancelOutcome> {
  const link = readTrialCancelToken(token);
  if (!link) return { state: 'invalid' };
  const trial = await readLinkedTrial(db, link);
  if (!trial) return { state: 'invalid' };

  const subscription = await stripe.subscriptions.retrieve(link.subscriptionId);
  const trialEnd = subscription.trial_end;
  if (subscription.status !== 'trialing' || !trialEnd) return { state: 'ended' };

  const plan = getBillingPlanPricing(trial.plan_tier).label;
  const cancelled = {
    state: 'cancelled' as const,
    plan,
    endsAt: new Date(trialEnd * 1000).toISOString(),
    userId: link.userId,
    subscriptionId: subscription.id,
    planTier: trial.plan_tier,
  };
  if (isCancelledBeforeCharge(subscription)) return { ...cancelled, changed: false };

  const updated = await stripe.subscriptions.update(
    subscription.id,
    { cancel_at_period_end: true },
    { idempotencyKey: `trial-cancel:${subscription.id}:${trialEnd}` },
  );
  try {
    await db.execute(
      `update public.subscriptions
          set cancel_at_period_end = true, canceled_at = $3, updated_at = now()
        where user_id = $1 and stripe_subscription_id = $2`,
      [
        link.userId,
        subscription.id,
        updated.canceled_at ? new Date(updated.canceled_at * 1000).toISOString() : null,
      ],
    );
  } catch (error) {
    logger.warn(
      { error, userId: link.userId, subscriptionId: subscription.id },
      'Trial cancelled in Stripe; the stored cancellation flag waits for the subscription webhook',
    );
  }
  await confirmTrialCancelled(db, link, plan, trialEnd);
  return { ...cancelled, changed: true };
}

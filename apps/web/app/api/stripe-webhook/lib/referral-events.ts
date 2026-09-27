import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { formatCredits } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { formatLocalizedPrice } from '@/lib/regional-pricing';
import { isStripeResourceMissing } from '@/lib/server/stripe-resource-ids';
import {
  bonusCreditExpiry,
  grantBonusCredits,
  revokeBonusCreditGrant,
} from '@/lib/services/bonus-credit-service';
import { isNotificationEmailConfigured } from '@/lib/services/notification-email-service';
import { recordNotification } from '@/lib/services/notification-service';
import { REFERRAL_PROGRAM } from '@/lib/services/referral-program';
import { referralDeviceOrNetworkBlock } from '@/lib/services/referral-service';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';

const DAY_MS = 86_400_000;
const MAX_LISTED_PAYMENTS = 10;
const MAX_LISTED_CARDS = 100;

interface ConvertibleReferral {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  created_at: string | Date;
  signup_network_hash: string | null;
  referrer_customer_id: string | null;
}

interface ReversibleReferral {
  id: string;
  qualifying_invoice_id: string;
  friend_bonus_grant_id: string | null;
  referrer_reward_grant_id: string | null;
}

function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return stripeId(invoice.parent?.subscription_details?.subscription ?? null);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function paymentCardFingerprint(
  stripe: Stripe,
  payment: Stripe.InvoicePayment,
): Promise<string | null> {
  const intentId = stripeId(payment.payment.payment_intent ?? null);
  if (intentId) {
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['payment_method'] });
    const method = intent.payment_method;
    return typeof method === 'object' && method !== null
      ? (method.card?.fingerprint ?? null)
      : null;
  }
  const chargeId = stripeId(payment.payment.charge ?? null);
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  return charge.payment_method_details?.card?.fingerprint ?? null;
}

async function invoiceCardFingerprints(stripe: Stripe, invoiceId: string): Promise<Set<string>> {
  const payments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    status: 'paid',
    limit: MAX_LISTED_PAYMENTS,
  });
  const fingerprints = await Promise.all(
    payments.data.map((payment) => paymentCardFingerprint(stripe, payment)),
  );
  return new Set(fingerprints.filter((value): value is string => value !== null));
}

async function customerCardFingerprints(
  stripe: Stripe,
  customerId: string | null,
): Promise<Set<string>> {
  if (!customerId) return new Set();
  try {
    const methods = await stripe.customers.listPaymentMethods(customerId, {
      type: 'card',
      limit: MAX_LISTED_CARDS,
    });
    return new Set(
      methods.data
        .map((method) => method.card?.fingerprint ?? null)
        .filter((value): value is string => value !== null),
    );
  } catch (error) {
    if (isStripeResourceMissing(error)) return new Set();
    throw error;
  }
}

async function paidWithReferrerCard(
  stripe: Stripe,
  invoiceId: string,
  referrerCustomerId: string | null,
): Promise<boolean> {
  const referrerCards = await customerCardFingerprints(stripe, referrerCustomerId);
  if (referrerCards.size === 0) return false;
  const paidCards = await invoiceCardFingerprints(stripe, invoiceId);
  return [...paidCards].some((fingerprint) => referrerCards.has(fingerprint));
}

export async function handleReferralInvoicePaid(
  db: DatabaseAdapter,
  stripe: Stripe,
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = stripeId(invoice.customer);
  if (
    !invoice.id ||
    invoice.status !== 'paid' ||
    invoice.amount_paid <= 0 ||
    !customerId ||
    !invoiceSubscriptionId(invoice)
  ) {
    return;
  }

  const [referral] = await db.query<ConvertibleReferral>(
    `select referral.id, referral.referrer_id, referral.referred_user_id, referral.created_at,
            referral.signup_network_hash, referrer.stripe_customer_id as referrer_customer_id
       from public.referrals referral
       join public.profiles friend on friend.id = referral.referred_user_id
       left join public.profiles referrer on referrer.id = referral.referrer_id
      where friend.stripe_customer_id = $1
        and referral.status = 'signed_up'
      limit 1
      for update of referral`,
    [customerId],
  );
  if (!referral) return;

  const blockedReason = (await paidWithReferrerCard(
    stripe,
    invoice.id,
    referral.referrer_customer_id,
  ))
    ? 'same_card'
    : await referralDeviceOrNetworkBlock(db, referral);
  if (blockedReason) {
    await db.execute(
      `update public.referrals
          set status = 'blocked', blocked_reason = $2
        where id = $1`,
      [referral.id, blockedReason],
    );
    logger.warn(
      { referralId: referral.id, invoiceId: invoice.id, blockedReason },
      'Referral blocked at its first paid invoice',
    );
    return;
  }

  const paidAtSeconds = invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000);
  const holdUntil = new Date(paidAtSeconds * 1000 + REFERRAL_PROGRAM.holdDays * DAY_MS);
  const grantedAt = new Date();
  const grantId = await grantBonusCredits(db, {
    userId: referral.referred_user_id,
    source: 'referral_friend',
    credits: REFERRAL_PROGRAM.rewardCredits,
    referenceId: referral.id,
    grantedAt,
  });
  await db.execute(
    `update public.referrals
        set status = 'converted',
            qualifying_invoice_id = $2,
            hold_until = $3,
            friend_bonus_grant_id = $4
      where id = $1`,
    [referral.id, invoice.id, holdUntil.toISOString(), grantId],
  );

  const credits = formatCredits(REFERRAL_PROGRAM.rewardCredits, { maximumFractionDigits: 0 });
  await recordNotification(db, {
    userId: referral.referred_user_id,
    category: 'billing',
    severity: 'success',
    title: `You received ${credits}`,
    message: `Thanks for joining through a friend's invite. ${credits} were added to your balance and expire on ${formatDate(bonusCreditExpiry(grantedAt))}.`,
    target: { kind: 'settings', id: 'usage' },
    dedupeKey: `referral-friend-bonus:${referral.id}`,
  });
}

export async function handleReferralChargeReversal(
  db: DatabaseAdapter,
  stripe: Stripe,
  charge: Stripe.Charge,
  reason: 'refund' | 'dispute',
): Promise<void> {
  const customerId = stripeId(charge.customer);
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!customerId || !paymentIntentId) return;

  const [referral] = await db.query<ReversibleReferral>(
    `select referral.id, referral.qualifying_invoice_id, referral.friend_bonus_grant_id,
            referral.referrer_reward_grant_id
       from public.referrals referral
       join public.profiles friend on friend.id = referral.referred_user_id
      where friend.stripe_customer_id = $1
        and referral.qualifying_invoice_id is not null
        and referral.clawed_back_at is null
      limit 1
      for update of referral`,
    [customerId],
  );
  if (!referral) return;

  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntentId },
    limit: MAX_LISTED_PAYMENTS,
  });
  const reversesQualifyingInvoice = payments.data.some(
    (payment) => stripeId(payment.invoice) === referral.qualifying_invoice_id,
  );
  if (!reversesQualifyingInvoice) return;

  const description =
    reason === 'refund'
      ? 'Referral bonus revoked after a refund'
      : 'Referral bonus revoked after a payment dispute';
  const revokedMicrousd = await Promise.all(
    [referral.friend_bonus_grant_id, referral.referrer_reward_grant_id]
      .filter((grantId): grantId is string => grantId !== null)
      .map((grantId) => revokeBonusCreditGrant(db, grantId, description)),
  );
  await db.execute(
    `update public.referrals
        set status = 'clawed_back', clawed_back_at = now()
      where id = $1`,
    [referral.id],
  );
  logger.warn(
    {
      referralId: referral.id,
      chargeId: charge.id,
      reason,
      revokedMicrousd: revokedMicrousd.reduce((sum, value) => sum + value, 0),
    },
    'Referral clawed back after its qualifying invoice was reversed',
  );
}

export async function notifyTrialEnding(
  db: DatabaseAdapter,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  if (
    subscription.status !== 'trialing' ||
    !subscription.trial_end ||
    subscription.cancel_at_period_end
  ) {
    return;
  }

  const [owner] = await db.query<{ user_id: string; email: string | null }>(
    `select subscription_row.user_id, profile.email
       from public.subscriptions subscription_row
       left join public.profiles profile on profile.id = subscription_row.user_id
      where subscription_row.stripe_subscription_id = $1
      limit 1`,
    [subscription.id],
  );
  if (!owner) return;

  const preview = await stripe.invoices.createPreview({ subscription: subscription.id });
  const interval =
    subscription.items.data[0]?.price.recurring?.interval === 'year' ? 'year' : 'month';
  const endsOn = formatDate(new Date(subscription.trial_end * 1000));
  const charge = formatLocalizedPrice(preview.amount_due, preview.currency, 'en-US');
  const title = `Your free trial ends on ${endsOn}`;
  const message =
    `Your card will be charged ${charge} on ${endsOn}, and again every ${interval}, unless ` +
    'you cancel before then in Settings > Billing.';
  const dedupeKey = `trial-ending:${subscription.id}:${subscription.trial_end}`;

  await recordNotification(db, {
    userId: owner.user_id,
    category: 'billing',
    severity: 'info',
    title,
    message,
    target: { kind: 'settings', id: 'billing' },
    dedupeKey,
  });

  const from = process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim();
  if (!owner.email || !from || !isNotificationEmailConfigured()) {
    logger.warn(
      { userId: owner.user_id, subscriptionId: subscription.id },
      'Trial ending reminder recorded in the app; no email address or sender is configured',
    );
    return;
  }
  const result = await sendTransactionalEmail({
    from,
    to: owner.email,
    subject: title,
    text: `${title}.\n\n${message}`,
    html: `<p>${escapeHtml(title)}.</p><p>${escapeHtml(message)}</p>`,
    idempotencyKey: dedupeKey,
  });
  if (!result.delivered) {
    logger.warn(
      { userId: owner.user_id, subscriptionId: subscription.id, reason: result.reason },
      'Trial ending reminder email was not delivered',
    );
  }
}

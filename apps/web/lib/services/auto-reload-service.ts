import 'server-only';

import { after } from 'next/server';
import Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AUTO_RELOAD_DEFAULT_THRESHOLD_CREDITS,
  DAILY_TOP_UP_LIMIT_USD,
  TOP_UP_CONVERSION,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  creditsFromMicrousd,
  formatCredits,
  isFreeBillingPlanTier,
  quoteTopUp,
  topUpChargedCents,
  topUpUnitsForUsd,
  type AutoReloadSettings,
  type AutoReloadSettingsUpdate,
  type TopUpQuote,
} from '@agiworkforce/types';
import { getOptionalEnv } from '@shared/utils/env';
import { grantCreditTopUp, isCreditTopUpApplied } from '@/app/api/stripe-webhook/lib/db';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { getSpendableCredits } from '@/lib/server/spendable-credits';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  isStripeCustomerId,
  isStripeResourceMissing,
  isStripeSubscriptionId,
} from '@/lib/server/stripe-resource-ids';
import {
  isNotificationEmailConfigured,
  TRANSACTIONAL_EMAIL_FOOTER_STYLE,
} from '@/lib/services/notification-email-service';
import { recordNotification } from '@/lib/services/notification-service';
import { evaluateActiveWorkspacePolicy } from '@/lib/services/organization-policy-gate';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';

const RELOAD_LEASE_SECONDS = 600;
const ATTEMPT_LOOKUP_SLACK_SECONDS = 60;
const ATTEMPT_LOOKUP_LIMIT = 20;
const SWEEP_PAGE_SIZE = 100;
const UNIQUE_VIOLATION = '23505';
const BILLING_SETTINGS_PATH = '/settings/billing';
const FAILURE_SUBJECT = 'Auto-reload is off: a payment did not go through';

const FAILURE_MESSAGES = {
  authentication_required:
    'Your bank asked you to confirm the payment, which can only happen while you are signed in.',
  insufficient_funds: 'Your card did not have enough funds.',
  expired_card: 'Your card has expired.',
  card_declined: 'Your card was declined.',
  payment_method_missing: 'There is no card on file for your plan.',
  payment_canceled: 'The payment was canceled before it completed.',
  payment_failed: 'The payment did not go through.',
} as const;

type AutoReloadFailureReason = keyof typeof FAILURE_MESSAGES;

export type AutoReloadOutcome =
  | 'not_configured'
  | 'disabled'
  | 'in_flight'
  | 'unavailable'
  | 'above_threshold'
  | 'daily_limit'
  | 'ineligible'
  | 'deferred'
  | 'charged'
  | 'processing'
  | 'failed'
  | 'released';

export type AutoReloadSaveResult =
  { status: 'saved'; settings: AutoReloadSettings } | { status: 'payment_method_required' };

export interface AutoReloadSweepReport {
  considered: number;
  errored: number;
  drained: boolean;
  outcomes: Partial<Record<AutoReloadOutcome, number>>;
}

interface AutoReloadRow {
  enabled: boolean;
  threshold_credits: number;
  amount_usd: number;
  reload_attempt_id: string | null;
  reload_payment_intent_id: string | null;
  lease_expired: boolean;
  last_attempt_at: string | Date | null;
  last_failure_at: string | Date | null;
  last_failure_reason: string | null;
}

interface TopUpBillingAccount {
  customerId: string;
  subscriptionId: string;
}

interface DefaultCard {
  id: string;
  brand: string;
  last4: string;
}

interface BillingInstrument {
  currency: string;
  card: DefaultCard | null;
}

interface ReloadPlan {
  quote: TopUpQuote;
  account: TopUpBillingAccount;
}

interface ReloadFailure {
  userId: string;
  attemptId: string;
  reason: AutoReloadFailureReason;
  credits: number | null;
}

interface ReloadPurchase {
  userId: string;
  attemptId: string;
  creditAmountCents: number;
  chargedCents: number;
}

const SETTINGS_COLUMNS = `enabled, threshold_credits, amount_usd, reload_attempt_id,
  reload_payment_intent_id, coalesce(reload_lease_expires_at <= now(), false) as lease_expired,
  last_attempt_at, last_failure_at, last_failure_reason`;

export function topUpChargesEnabled(): boolean {
  const value = process.env['STRIPE_CHECKOUT_ENABLED']?.trim().toLowerCase();
  return (
    value !== '0' &&
    value !== 'false' &&
    value !== 'off' &&
    Boolean(getOptionalEnv('STRIPE_SECRET_KEY'))
  );
}

export function isAutoReloadPaymentIntent(paymentIntent: Stripe.PaymentIntent): boolean {
  return (
    paymentIntent.metadata?.['type'] === 'credit_topup' &&
    paymentIntent.metadata?.['auto_reload'] === 'true'
  );
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function failureMessage(reason: string): string {
  return Object.hasOwn(FAILURE_MESSAGES, reason)
    ? FAILURE_MESSAGES[reason as AutoReloadFailureReason]
    : FAILURE_MESSAGES.payment_failed;
}

function failureReasonOf(
  error: { code?: string | null; decline_code?: string | null } | null | undefined,
): AutoReloadFailureReason {
  const codes = [error?.decline_code, error?.code];
  if (codes.includes('authentication_required')) return 'authentication_required';
  if (codes.includes('insufficient_funds')) return 'insufficient_funds';
  if (codes.includes('expired_card')) return 'expired_card';
  if (codes.includes('card_declined')) return 'card_declined';
  return 'payment_failed';
}

function paymentFailureReason(paymentIntent: Stripe.PaymentIntent): AutoReloadFailureReason {
  if (paymentIntent.status === 'requires_action') return 'authentication_required';
  if (paymentIntent.status === 'canceled') return 'payment_canceled';
  return failureReasonOf(paymentIntent.last_payment_error);
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toAutoReloadSettings(
  row: AutoReloadRow | undefined,
  card: DefaultCard | null,
): AutoReloadSettings {
  return {
    enabled: row?.enabled ?? false,
    thresholdCredits: row?.threshold_credits ?? AUTO_RELOAD_DEFAULT_THRESHOLD_CREDITS,
    amountUsd: row?.amount_usd ?? TOP_UP_PRESET_AMOUNTS_USD[0],
    paymentMethod: card ? { brand: card.brand, last4: card.last4 } : null,
    lastFailure:
      row?.last_failure_at && row.last_failure_reason
        ? { at: toIso(row.last_failure_at), reason: failureMessage(row.last_failure_reason) }
        : null,
  };
}

async function readSettingsRow(
  db: DatabaseAdapter,
  userId: string,
): Promise<AutoReloadRow | undefined> {
  const [row] = await db.query<AutoReloadRow>(
    `select ${SETTINGS_COLUMNS}
       from public.auto_reload_settings
      where user_id = $1
      limit 1`,
    [userId],
  );
  return row;
}

async function upsertSettingsRow(
  db: DatabaseAdapter,
  userId: string,
  update: AutoReloadSettingsUpdate,
): Promise<AutoReloadRow> {
  const [row] = await db.query<AutoReloadRow>(
    `insert into public.auto_reload_settings as settings
       (user_id, enabled, threshold_credits, amount_usd)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update
        set enabled = excluded.enabled,
            threshold_credits = excluded.threshold_credits,
            amount_usd = excluded.amount_usd,
            last_failure_at = case when excluded.enabled then null else settings.last_failure_at end,
            last_failure_reason =
              case when excluded.enabled then null else settings.last_failure_reason end,
            updated_at = now()
     returning ${SETTINGS_COLUMNS}`,
    [userId, update.enabled, update.thresholdCredits, update.amountUsd],
  );
  if (!row) throw createError.internal('Auto-reload settings were not saved.');
  return row;
}

async function readTopUpBillingAccount(
  db: DatabaseAdapter,
  userId: string,
): Promise<TopUpBillingAccount | null> {
  const [billing] = await db.query<
    Pick<SubscriptionRow, 'plan_tier' | 'status' | 'stripe_customer_id' | 'stripe_subscription_id'>
  >(
    `select plan_tier, status, stripe_customer_id, stripe_subscription_id
       from public.subscriptions
      where user_id = $1
      limit 1`,
    [userId],
  );
  if (
    !billing ||
    isFreeBillingPlanTier(billing.plan_tier) ||
    !['active', 'trialing'].includes(billing.status) ||
    !isStripeCustomerId(billing.stripe_customer_id) ||
    !isStripeSubscriptionId(billing.stripe_subscription_id)
  ) {
    return null;
  }
  return { customerId: billing.stripe_customer_id, subscriptionId: billing.stripe_subscription_id };
}

function cardOf(method: string | Stripe.PaymentMethod | null | undefined): DefaultCard | null {
  if (!method || typeof method === 'string' || method.type !== 'card' || !method.card) return null;
  return { id: method.id, brand: method.card.brand, last4: method.card.last4 };
}

async function readBillingInstrument(
  stripe: Stripe,
  account: TopUpBillingAccount,
): Promise<BillingInstrument> {
  const subscription = await stripe.subscriptions.retrieve(account.subscriptionId, {
    expand: ['default_payment_method'],
  });
  const currency = subscription.currency.trim().toLowerCase();
  if (subscription.default_payment_method) {
    return { currency, card: cardOf(subscription.default_payment_method) };
  }
  const customer = await stripe.customers.retrieve(account.customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });
  return {
    currency,
    card: customer.deleted ? null : cardOf(customer.invoice_settings?.default_payment_method),
  };
}

async function readInstrumentForSettings(
  account: TopUpBillingAccount | null,
  userId: string,
): Promise<BillingInstrument | null> {
  const stripe = getStripeClientOrNull();
  if (!account || !stripe) return null;
  try {
    return await readBillingInstrument(stripe, account);
  } catch (error) {
    logger.warn(
      { error, userId },
      'Auto-reload settings could not read the saved card from Stripe',
    );
    throw createError
      .serviceUnavailable('Your saved card could not be read right now. Try again in a moment.')
      .asUserSafe();
  }
}

export async function readAutoReloadSettings(
  db: DatabaseAdapter,
  userId: string,
): Promise<AutoReloadSettings> {
  const [row, account] = await Promise.all([
    readSettingsRow(db, userId),
    readTopUpBillingAccount(db, userId),
  ]);
  const instrument = await readInstrumentForSettings(account, userId);
  return toAutoReloadSettings(row, instrument?.card ?? null);
}

export async function saveAutoReloadSettings(
  db: DatabaseAdapter,
  userId: string,
  update: AutoReloadSettingsUpdate,
): Promise<AutoReloadSaveResult> {
  const account = await readTopUpBillingAccount(db, userId);

  if (!update.enabled) {
    const row = await upsertSettingsRow(db, userId, update);
    const instrument = await readInstrumentForSettings(account, userId).catch(() => null);
    return { status: 'saved', settings: toAutoReloadSettings(row, instrument?.card ?? null) };
  }

  if (!topUpChargesEnabled()) {
    throw createError.serviceUnavailable('Auto-reload is not available right now.').asUserSafe();
  }
  if (!account) {
    throw createError.validation(
      'Auto-reload is available for active plans billed by AGI Workforce. Start or restore your plan first.',
    );
  }
  const instrument = await readInstrumentForSettings(account, userId);
  if (!instrument) {
    throw createError.serviceUnavailable('Auto-reload is not available right now.').asUserSafe();
  }
  if (instrument.currency !== 'usd') {
    throw createError.validation(
      `Auto-reload is billed in USD and your plan is billed in ${instrument.currency.toUpperCase()}. ` +
        'Upgrade your plan for more included usage, or contact support.',
    );
  }
  if (!instrument.card) return { status: 'payment_method_required' };

  const row = await upsertSettingsRow(db, userId, update);
  return { status: 'saved', settings: toAutoReloadSettings(row, instrument.card) };
}

async function readReloadBalanceCredits(
  db: DatabaseAdapter,
  userId: string,
): Promise<number | null> {
  const [spendable, bonusRows] = await Promise.all([
    getSpendableCredits(db, userId),
    db.query<{ remaining_credits: string | number | null }>(
      `select coalesce(sum(credits_remaining), 0) as remaining_credits
         from public.bonus_credit_grants
        where user_id = $1
          and revoked_at is null
          and expires_at > now()`,
      [userId],
    ),
  ]);
  if (spendable.availableMicrousd === null) return null;
  const bonusCredits = Number(bonusRows[0]?.remaining_credits ?? 0);
  return (
    creditsFromMicrousd(spendable.availableMicrousd) +
    (Number.isFinite(bonusCredits) ? bonusCredits : 0)
  );
}

async function fitsDailyTopUpLimit(
  db: DatabaseAdapter,
  userId: string,
  credits: number,
): Promise<boolean> {
  const [purchasedToday] = await db.query<{ purchased_microusd: string | number | null }>(
    `select coalesce(sum(amount_microusd), 0) as purchased_microusd
       from public.credit_transactions
      where user_id = $1
        and transaction_type = 'purchase'
        and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`,
    [userId],
  );
  const purchasedTodayCredits = creditsFromMicrousd(
    Number(purchasedToday?.purchased_microusd ?? 0),
  );
  return purchasedTodayCredits + credits <= DAILY_TOP_UP_LIMIT_USD * TOP_UP_UNITS_PER_USD;
}

async function planReload(
  db: DatabaseAdapter,
  userId: string,
  row: AutoReloadRow,
): Promise<ReloadPlan | AutoReloadOutcome> {
  const balance = await readReloadBalanceCredits(db, userId);
  if (balance === null) return 'deferred';
  if (balance >= row.threshold_credits) return 'above_threshold';
  const quote = quoteTopUp(row.amount_usd, { autoReload: true });
  if (!quote) {
    logger.error(
      { userId, amountUsd: row.amount_usd },
      'Auto-reload skipped: the saved pack is no longer a valid top-up amount',
    );
    return 'ineligible';
  }
  if (!(await fitsDailyTopUpLimit(db, userId, quote.credits))) return 'daily_limit';
  const account = await readTopUpBillingAccount(db, userId);
  return account ? { quote, account } : 'ineligible';
}

async function acquireLease(db: DatabaseAdapter, userId: string): Promise<string | null> {
  const [row] = await db.query<{ reload_attempt_id: string }>(
    `update public.auto_reload_settings
        set reload_attempt_id = gen_random_uuid(),
            reload_lease_expires_at = now() + make_interval(secs => $2::integer),
            last_attempt_at = now(),
            updated_at = now()
      where user_id = $1
        and enabled
        and reload_attempt_id is null
      returning reload_attempt_id`,
    [userId, RELOAD_LEASE_SECONDS],
  );
  return row?.reload_attempt_id ?? null;
}

async function releaseLease(db: DatabaseAdapter, userId: string, attemptId: string): Promise<void> {
  await db.execute(
    `update public.auto_reload_settings
        set reload_attempt_id = null,
            reload_payment_intent_id = null,
            reload_lease_expires_at = null,
            updated_at = now()
      where user_id = $1 and reload_attempt_id = $2`,
    [userId, attemptId],
  );
}

async function extendLease(db: DatabaseAdapter, userId: string, attemptId: string): Promise<void> {
  await db.execute(
    `update public.auto_reload_settings
        set reload_lease_expires_at = now() + make_interval(secs => $3::integer),
            updated_at = now()
      where user_id = $1 and reload_attempt_id = $2`,
    [userId, attemptId, RELOAD_LEASE_SECONDS],
  );
}

async function recordPaymentIntent(
  db: DatabaseAdapter,
  userId: string,
  attemptId: string,
  paymentIntentId: string,
): Promise<void> {
  await db.execute(
    `update public.auto_reload_settings
        set reload_payment_intent_id = $3,
            updated_at = now()
      where user_id = $1 and reload_attempt_id = $2`,
    [userId, attemptId, paymentIntentId],
  );
}

async function completeReload(
  db: DatabaseAdapter,
  userId: string,
  attemptId: string,
): Promise<void> {
  await db.execute(
    `update public.auto_reload_settings
        set reload_attempt_id = null,
            reload_payment_intent_id = null,
            reload_lease_expires_at = null,
            last_failure_at = null,
            last_failure_reason = null,
            updated_at = now()
      where user_id = $1 and reload_attempt_id = $2`,
    [userId, attemptId],
  );
}

function settingsUrl(): string | null {
  const origin = (process.env['NEXT_PUBLIC_APP_URL'] ?? '').trim().replace(/\/$/, '');
  return origin ? `${origin}${BILLING_SETTINGS_PATH}` : null;
}

async function emailReloadFailure(
  db: DatabaseAdapter,
  failure: ReloadFailure,
  headline: string,
): Promise<void> {
  if (!isNotificationEmailConfigured()) {
    logger.warn(
      { userId: failure.userId },
      'Auto-reload failure email not sent: no transactional email provider is configured',
    );
    return;
  }
  const [profile] = await db.query<{ email: string | null }>(
    'select email from public.profiles where id = $1 limit 1',
    [failure.userId],
  );
  const to = profile?.email?.trim();
  if (!to) {
    logger.warn({ userId: failure.userId }, 'Auto-reload failure email not sent: no email on file');
    return;
  }

  const link = settingsUrl();
  const consequence =
    'Auto-reload is now off, so no further charges will be attempted until you turn it back on.';
  const action = link
    ? `Check your card and turn auto-reload back on in Settings > Billing: ${link}`
    : 'Check your card and turn auto-reload back on in Settings > Billing.';
  const footer = 'You are receiving this because you turned on auto-reload.';

  const result = await sendTransactionalEmail({
    from: process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim() ?? '',
    to,
    subject: FAILURE_SUBJECT,
    text: [headline, '', consequence, '', action, '', footer].join('\n'),
    html: [
      `<p>${headline}</p>`,
      `<p>${consequence}</p>`,
      link
        ? `<p><a href="${link}">Open Settings &gt; Billing</a></p>`
        : '<p>Check your card and turn auto-reload back on in Settings &gt; Billing.</p>',
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${footer}</p>`,
    ].join(''),
    idempotencyKey: `auto-reload-failed:${failure.attemptId}`,
  });
  if (!result.delivered) {
    logger.warn(
      { userId: failure.userId, reason: result.reason },
      'Auto-reload failure email could not be delivered',
    );
  }
}

async function failReload(db: DatabaseAdapter, failure: ReloadFailure): Promise<void> {
  const [row] = await db.query<{ amount_usd: number }>(
    `update public.auto_reload_settings
        set enabled = false,
            reload_attempt_id = null,
            reload_payment_intent_id = null,
            reload_lease_expires_at = null,
            last_failure_at = now(),
            last_failure_reason = $3,
            updated_at = now()
      where user_id = $1 and reload_attempt_id = $2
      returning amount_usd`,
    [failure.userId, failure.attemptId, failure.reason],
  );
  if (!row) return;

  logger.warn(
    { userId: failure.userId, attemptId: failure.attemptId, reason: failure.reason },
    'Auto-reload payment failed; auto-reload is off until the account turns it back on',
  );

  const credits = failure.credits ?? topUpUnitsForUsd(row.amount_usd);
  const attempted = credits === null ? 'credits' : formatCredits(credits);
  const headline = `We tried to add ${attempted} to your AGI Workforce balance, and the payment did not go through. ${FAILURE_MESSAGES[failure.reason]}`;

  await recordNotification(db, {
    userId: failure.userId,
    category: 'billing',
    severity: 'error',
    title: FAILURE_SUBJECT,
    message: `${headline} Turn auto-reload back on in Settings > Billing once your card is ready.`,
    target: { kind: 'settings', id: 'billing' },
    dedupeKey: `auto-reload-failed:${failure.attemptId}`,
  });
  await emailReloadFailure(db, failure, headline);
}

async function cancelOpenPaymentIntent(
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  if (paymentIntent.status === 'canceled' || paymentIntent.status === 'succeeded') return;
  try {
    await stripe.paymentIntents.cancel(paymentIntent.id);
  } catch (error) {
    logger.warn(
      { error, paymentIntentId: paymentIntent.id },
      'A failed auto-reload PaymentIntent could not be canceled',
    );
  }
}

function readReloadPurchase(paymentIntent: Stripe.PaymentIntent): ReloadPurchase | null {
  const metadata = paymentIntent.metadata ?? {};
  const userId = metadata['user_id'];
  const attemptId = metadata['auto_reload_attempt_id'];
  const creditAmountCents = Number(metadata['credit_amount_cents']);
  const chargedCents = topUpChargedCents({
    conversion: metadata['conversion'],
    amountCents: creditAmountCents,
    units: Number(metadata['top_up_units']),
    priceCents: Number(metadata['price_cents']),
    amountUsd: Number(metadata['amount_usd']),
    autoReload: metadata['auto_reload'] === 'true',
  });
  if (!userId || !attemptId || chargedCents === null) return null;
  return { userId, attemptId, creditAmountCents, chargedCents };
}

export async function settleAutoReloadPayment(
  db: DatabaseAdapter,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const purchase = readReloadPurchase(paymentIntent);
  if (!purchase) {
    logger.error(
      { paymentIntentId: paymentIntent.id },
      'Invalid required metadata for auto-reload top-up',
    );
    throw new Error(`Invalid auto-reload metadata for PaymentIntent ${paymentIntent.id}`);
  }

  if (
    paymentIntent.status !== 'succeeded' ||
    paymentIntent.currency !== 'usd' ||
    paymentIntent.amount_received !== purchase.chargedCents
  ) {
    logger.error(
      {
        paymentIntentId: paymentIntent.id,
        userId: purchase.userId,
        status: paymentIntent.status,
        expectedCents: purchase.chargedCents,
        actualAmountReceived: paymentIntent.amount_received,
      },
      'SECURITY: Auto-reload payment does not match its purchase metadata',
    );
    throw new Error(`Auto-reload payment mismatch for PaymentIntent ${paymentIntent.id}`);
  }

  if (await isCreditTopUpApplied(db, purchase.userId, paymentIntent.id)) {
    logger.info(
      { paymentIntentId: paymentIntent.id, userId: purchase.userId },
      'Auto-reload top-up was already applied',
    );
  } else {
    logger.error(
      { paymentIntentId: paymentIntent.id, userId: purchase.userId },
      'TAX NOT COLLECTED: auto-reload PaymentIntents carry no Stripe Tax calculation',
    );
    await grantCreditTopUp(db, {
      userId: purchase.userId,
      creditAmountCents: purchase.creditAmountCents,
      receiptId: paymentIntent.id,
    });
  }

  await completeReload(db, purchase.userId, purchase.attemptId);
}

export async function failAutoReloadPayment(
  db: DatabaseAdapter,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  const userId = paymentIntent.metadata?.['user_id'];
  const attemptId = paymentIntent.metadata?.['auto_reload_attempt_id'];
  if (!userId || !attemptId) {
    logger.error(
      { paymentIntentId: paymentIntent.id },
      'Auto-reload payment failure names no account or attempt',
    );
    return;
  }
  await failReload(db, {
    userId,
    attemptId,
    reason: paymentFailureReason(paymentIntent),
    credits: positiveInteger(paymentIntent.metadata?.['top_up_units']),
  });
}

async function settleInTransaction(
  db: DatabaseAdapter,
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  try {
    await db.transaction((tx) => settleAutoReloadPayment(tx, paymentIntent));
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== UNIQUE_VIOLATION) throw error;
    logger.info(
      { paymentIntentId: paymentIntent.id },
      'Auto-reload top-up was granted concurrently by another settlement path',
    );
  }
}

async function resolvePaymentIntent(
  db: DatabaseAdapter,
  stripe: Stripe,
  failure: Omit<ReloadFailure, 'reason'>,
  paymentIntent: Stripe.PaymentIntent,
): Promise<AutoReloadOutcome> {
  switch (paymentIntent.status) {
    case 'succeeded':
      await settleInTransaction(db, paymentIntent);
      return 'charged';
    case 'processing':
      await extendLease(db, failure.userId, failure.attemptId);
      return 'processing';
    default:
      await failReload(db, { ...failure, reason: paymentFailureReason(paymentIntent) });
      await cancelOpenPaymentIntent(stripe, paymentIntent);
      return 'failed';
  }
}

async function auditReloadCharge(
  userId: string,
  quote: TopUpQuote,
  paymentIntentId: string | null,
  failureReason: AutoReloadFailureReason | null,
): Promise<void> {
  await recordAuditEvent({
    userId,
    eventType: 'checkout_started',
    outcome: failureReason ? 'failure' : 'success',
    surface: 'auto_reload',
    detail: {
      resourceType: 'credit_topup',
      source: 'auto_reload',
      resourceName: `$${quote.amountUsd}`,
      count: quote.credits,
      ...(paymentIntentId ? { resourceId: paymentIntentId } : {}),
      ...(failureReason ? { reason: failureReason } : {}),
    },
  });
}

async function handleChargeError(
  db: DatabaseAdapter,
  stripe: Stripe,
  failure: Omit<ReloadFailure, 'reason'>,
  quote: TopUpQuote,
  error: unknown,
): Promise<AutoReloadOutcome> {
  if (error instanceof Stripe.errors.StripeCardError) {
    const reason = failureReasonOf(error);
    await failReload(db, { ...failure, reason });
    if (error.payment_intent) await cancelOpenPaymentIntent(stripe, error.payment_intent);
    await auditReloadCharge(failure.userId, quote, error.payment_intent?.id ?? null, reason);
    return 'failed';
  }
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    const reason = error.code === 'resource_missing' ? 'payment_method_missing' : 'payment_failed';
    logger.error(
      {
        userId: failure.userId,
        attemptId: failure.attemptId,
        code: error.code,
        message: error.message,
      },
      'Stripe refused the auto-reload charge request',
    );
    await failReload(db, { ...failure, reason });
    await auditReloadCharge(failure.userId, quote, null, reason);
    return 'failed';
  }
  logger.warn(
    { error, userId: failure.userId, attemptId: failure.attemptId },
    'Auto-reload charge outcome is unknown; the sweep reconciles it once the lease expires',
  );
  return 'deferred';
}

function reloadMetadata(
  userId: string,
  attemptId: string,
  quote: TopUpQuote,
): Stripe.MetadataParam {
  return {
    type: 'credit_topup',
    user_id: userId,
    conversion: TOP_UP_CONVERSION,
    amount_usd: String(quote.amountUsd),
    price_cents: String(quote.priceCents),
    discount_percent: String(quote.discountPercent),
    credit_amount_cents: String(quote.budgetCents),
    top_up_units: String(quote.credits),
    auto_reload: 'true',
    auto_reload_attempt_id: attemptId,
  };
}

async function chargeReload(
  db: DatabaseAdapter,
  userId: string,
  attemptId: string,
  plan: ReloadPlan,
): Promise<AutoReloadOutcome> {
  const stripe = getStripeClientOrNull();
  if (!stripe) {
    await releaseLease(db, userId, attemptId);
    return 'unavailable';
  }

  let instrument: BillingInstrument;
  try {
    instrument = await readBillingInstrument(stripe, plan.account);
  } catch (error) {
    logger.warn({ error, userId }, 'Auto-reload deferred: the saved card could not be read');
    await releaseLease(db, userId, attemptId);
    return 'deferred';
  }
  if (instrument.currency !== 'usd') {
    logger.warn(
      { userId, currency: instrument.currency },
      'Auto-reload skipped: top-ups are billed in USD and this plan is not',
    );
    await releaseLease(db, userId, attemptId);
    return 'ineligible';
  }

  const failure = { userId, attemptId, credits: plan.quote.credits };
  if (!instrument.card) {
    await failReload(db, { ...failure, reason: 'payment_method_missing' });
    return 'failed';
  }

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: plan.quote.priceCents,
        currency: 'usd',
        customer: plan.account.customerId,
        payment_method: instrument.card.id,
        payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        description: `AGI auto-reload, ${formatCredits(plan.quote.credits)}`,
        metadata: reloadMetadata(userId, attemptId, plan.quote),
      },
      { idempotencyKey: `auto-reload:${attemptId}` },
    );
  } catch (error) {
    return handleChargeError(db, stripe, failure, plan.quote, error);
  }

  await recordPaymentIntent(db, userId, attemptId, paymentIntent.id);
  await auditReloadCharge(userId, plan.quote, paymentIntent.id, null);
  return resolvePaymentIntent(db, stripe, failure, paymentIntent);
}

async function findAttemptPaymentIntent(
  db: DatabaseAdapter,
  stripe: Stripe,
  userId: string,
  attemptId: string,
  startedAt: string | Date | null,
): Promise<Stripe.PaymentIntent | null> {
  const [billing] = await db.query<Pick<SubscriptionRow, 'stripe_customer_id'>>(
    'select stripe_customer_id from public.subscriptions where user_id = $1 limit 1',
    [userId],
  );
  const customerId = billing?.stripe_customer_id;
  if (!isStripeCustomerId(customerId)) return null;
  const since = startedAt
    ? Math.floor(new Date(startedAt).getTime() / 1000) - ATTEMPT_LOOKUP_SLACK_SECONDS
    : null;
  const page = await stripe.paymentIntents.list({
    customer: customerId,
    limit: ATTEMPT_LOOKUP_LIMIT,
    ...(since === null ? {} : { created: { gte: since } }),
  });
  return (
    page.data.find(
      (paymentIntent) => paymentIntent.metadata?.['auto_reload_attempt_id'] === attemptId,
    ) ?? null
  );
}

async function retrieveRecordedPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent | null> {
  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

async function recoverReload(
  db: DatabaseAdapter,
  userId: string,
  attemptId: string,
  row: AutoReloadRow,
): Promise<AutoReloadOutcome> {
  const stripe = getStripeClientOrNull();
  if (!stripe) return 'deferred';

  const paymentIntent = row.reload_payment_intent_id
    ? await retrieveRecordedPaymentIntent(stripe, row.reload_payment_intent_id)
    : await findAttemptPaymentIntent(db, stripe, userId, attemptId, row.last_attempt_at);
  if (!paymentIntent) {
    await releaseLease(db, userId, attemptId);
    return 'released';
  }

  logger.info(
    { userId, attemptId, paymentIntentId: paymentIntent.id, status: paymentIntent.status },
    'Reconciling an auto-reload whose lease expired before it settled',
  );
  return resolvePaymentIntent(
    db,
    stripe,
    { userId, attemptId, credits: positiveInteger(paymentIntent.metadata?.['top_up_units']) },
    paymentIntent,
  );
}

async function runAutoReload(userId: string): Promise<AutoReloadOutcome> {
  const db = getNeonDb();
  const row = await readSettingsRow(db, userId);
  if (!row) return 'not_configured';
  if (row.reload_attempt_id) {
    return row.lease_expired ? recoverReload(db, userId, row.reload_attempt_id, row) : 'in_flight';
  }
  if (!row.enabled) return 'disabled';
  if (!topUpChargesEnabled()) return 'unavailable';

  const plan = await planReload(db, userId, row);
  if (typeof plan === 'string') return plan;

  const attemptId = await acquireLease(db, userId);
  if (!attemptId) return 'in_flight';

  let charging = false;
  try {
    const current = await readSettingsRow(db, userId);
    const confirmed =
      current?.enabled && current.reload_attempt_id === attemptId
        ? await planReload(db, userId, current)
        : 'disabled';
    if (typeof confirmed === 'string') {
      await releaseLease(db, userId, attemptId);
      return confirmed;
    }

    const policy = await evaluateActiveWorkspacePolicy(db, userId, { resource: 'credit_topup' });
    if (!policy.allowed) {
      logger.warn(
        { userId, code: policy.code },
        'Auto-reload skipped: workspace billing policy refuses top-ups',
      );
      await releaseLease(db, userId, attemptId);
      return 'ineligible';
    }

    charging = true;
    return await chargeReload(db, userId, attemptId, confirmed);
  } catch (error) {
    if (!charging) await releaseLease(db, userId, attemptId);
    throw error;
  }
}

export function maybeTriggerAutoReload(userId: string): void {
  const task = runAutoReload(userId).then(
    () => undefined,
    (error: unknown) => {
      logger.error({ error, userId }, 'Auto-reload check after a settled charge failed');
    },
  );
  try {
    after(task);
  } catch {
    void task;
  }
}

export async function sweepAutoReloads(deadline: number): Promise<AutoReloadSweepReport> {
  const db = getNeonDb();
  const report: AutoReloadSweepReport = { considered: 0, errored: 0, drained: false, outcomes: {} };
  let cursor: string | null = null;

  while (Date.now() < deadline) {
    const page: Array<{ user_id: string }> = await db.query<{ user_id: string }>(
      `select user_id
         from public.auto_reload_settings
        where (enabled or reload_attempt_id is not null)
          and ($1::text is null or user_id > $1)
        order by user_id
        limit $2`,
      [cursor, SWEEP_PAGE_SIZE],
    );

    for (const { user_id: userId } of page) {
      if (Date.now() >= deadline) return report;
      cursor = userId;
      report.considered += 1;
      try {
        const outcome = await runAutoReload(userId);
        report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1;
      } catch (error) {
        report.errored += 1;
        logger.error({ error, userId }, 'Auto-reload sweep could not process an account');
      }
    }

    if (page.length < SWEEP_PAGE_SIZE) {
      report.drained = true;
      break;
    }
  }

  return report;
}

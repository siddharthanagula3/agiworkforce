import 'server-only';

import { after } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  AUTO_RELOAD_CONSENT_VERSION,
  AUTO_RELOAD_DEFAULT_THRESHOLD_CREDITS,
  DAILY_TOP_UP_LIMIT_USD,
  TOP_UP_CONVERSION,
  TOP_UP_PRESET_AMOUNTS_USD,
  TOP_UP_UNITS_PER_USD,
  autoReloadConsentText,
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
import type {
  NormalizedBillingInstrument,
  NormalizedCard,
  NormalizedPayment,
} from '@/lib/server/payments/domain';
import {
  calculateStripeOffSessionTax,
  cancelStripePayment,
  chargeStripeOffSession,
  listStripeCustomerPayments,
  readStripeBillingInstrument,
  retrieveStripePayment,
} from '@/lib/server/payments/stripe-provider';
import { isStripeCustomerId, isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import { getPrepaidCreditBalances } from '@/lib/services/bonus-credit-service';
import {
  isNotificationEmailConfigured,
  TRANSACTIONAL_EMAIL_FOOTER_STYLE,
} from '@/lib/services/notification-email-service';
import { recordNotification } from '@/lib/services/notification-service';
import { evaluateActiveWorkspacePolicy } from '@/lib/services/organization-policy-gate';
import { sendTransactionalEmail } from '@/lib/support/handoff/resend-client';

const RELOAD_CURRENCY = 'USD';
const RELOAD_LEASE_SECONDS = 600;
const ATTEMPT_LOOKUP_SLACK_SECONDS = 60;
const ATTEMPT_LOOKUP_LIMIT = 20;
const SWEEP_PAGE_SIZE = 100;
const UNIQUE_VIOLATION = '23505';
const BILLING_SETTINGS_PATH = '/settings/billing';
const FAILURE_SUBJECT = 'Auto-reload is off: a payment did not go through';
const CONSENT_SUBJECT = 'Auto-reload is on';
const EMAIL_FOOTER = 'You are receiving this because you turned on auto-reload.';

const FAILURE_MESSAGES = {
  authentication_required:
    'Your bank asked you to confirm the payment, which can only happen while you are signed in.',
  insufficient_funds: 'Your card did not have enough funds.',
  expired_card: 'Your card has expired.',
  card_declined: 'Your card was declined.',
  payment_method_missing: 'There is no card on file for your plan.',
  billing_address_missing:
    'Your billing address is missing or incomplete, so the tax on the charge could not be worked out.',
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
  | { status: 'saved'; settings: AutoReloadSettings }
  | { status: 'payment_method_required' }
  | { status: 'consent_outdated' };

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
  consent_version: string | null;
  consent_accepted_at: string | Date | null;
}

interface TopUpBillingAccount {
  customerId: string;
  subscriptionId: string;
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
  taxCents: number;
}

interface ReloadCharge {
  amountCents: number;
  taxCents: number;
  calculationId: string;
  country: string | null;
}

const SETTINGS_COLUMNS = `enabled, threshold_credits, amount_usd, reload_attempt_id,
  reload_payment_intent_id, coalesce(reload_lease_expires_at <= now(), false) as lease_expired,
  last_attempt_at, last_failure_at, last_failure_reason, consent_version, consent_accepted_at`;

export function topUpChargesEnabled(): boolean {
  const value = process.env['STRIPE_CHECKOUT_ENABLED']?.trim().toLowerCase();
  return (
    value !== '0' &&
    value !== 'false' &&
    value !== 'off' &&
    Boolean(getOptionalEnv('STRIPE_SECRET_KEY'))
  );
}

export function isAutoReloadPaymentIntent(payment: NormalizedPayment): boolean {
  return payment.metadata['type'] === 'credit_topup' && payment.metadata['auto_reload'] === 'true';
}

function toIso(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function runAfterResponse(task: Promise<void>): void {
  try {
    after(task);
  } catch {
    void task;
  }
}

function failureMessage(reason: string): string {
  return Object.hasOwn(FAILURE_MESSAGES, reason)
    ? FAILURE_MESSAGES[reason as AutoReloadFailureReason]
    : FAILURE_MESSAGES.payment_failed;
}

function failureReasonOf(decline: {
  failureCode: string | null;
  declineCode: string | null;
}): AutoReloadFailureReason {
  const codes = [decline.declineCode, decline.failureCode];
  if (codes.includes('authentication_required')) return 'authentication_required';
  if (codes.includes('insufficient_funds')) return 'insufficient_funds';
  if (codes.includes('expired_card')) return 'expired_card';
  if (codes.includes('card_declined')) return 'card_declined';
  return 'payment_failed';
}

function paymentFailureReason(payment: NormalizedPayment): AutoReloadFailureReason {
  if (payment.status === 'requires_action') return 'authentication_required';
  if (payment.status === 'canceled') return 'payment_canceled';
  return failureReasonOf(payment);
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toAutoReloadSettings(
  row: AutoReloadRow | undefined,
  card: NormalizedCard | null,
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
    consent:
      row?.consent_version && row.consent_accepted_at
        ? { version: row.consent_version, acceptedAt: toIso(row.consent_accepted_at) }
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

async function saveDisabledSettings(
  db: DatabaseAdapter,
  userId: string,
  update: AutoReloadSettingsUpdate,
): Promise<AutoReloadRow> {
  const [row] = await db.query<AutoReloadRow>(
    `insert into public.auto_reload_settings (user_id, enabled, threshold_credits, amount_usd)
     values ($1, false, $2, $3)
     on conflict (user_id) do update
        set enabled = false,
            threshold_credits = excluded.threshold_credits,
            amount_usd = excluded.amount_usd,
            updated_at = now()
     returning ${SETTINGS_COLUMNS}`,
    [userId, update.thresholdCredits, update.amountUsd],
  );
  if (!row) throw createError.internal('Auto-reload settings were not saved.');
  return row;
}

async function saveConsentedSettings(
  db: DatabaseAdapter,
  userId: string,
  update: AutoReloadSettingsUpdate,
  card: NormalizedCard,
): Promise<AutoReloadRow> {
  const [row] = await db.query<AutoReloadRow>(
    `insert into public.auto_reload_settings
       (user_id, enabled, threshold_credits, amount_usd, consent_version, consent_accepted_at,
        consent_amount_usd, consent_threshold_credits, consent_card_brand, consent_card_last4)
     values ($1, true, $2, $3, $4, now(), $3, $2, $5, $6)
     on conflict (user_id) do update
        set enabled = true,
            threshold_credits = excluded.threshold_credits,
            amount_usd = excluded.amount_usd,
            consent_version = excluded.consent_version,
            consent_accepted_at = excluded.consent_accepted_at,
            consent_amount_usd = excluded.consent_amount_usd,
            consent_threshold_credits = excluded.consent_threshold_credits,
            consent_card_brand = excluded.consent_card_brand,
            consent_card_last4 = excluded.consent_card_last4,
            last_failure_at = null,
            last_failure_reason = null,
            updated_at = now()
     returning ${SETTINGS_COLUMNS}`,
    [
      userId,
      update.thresholdCredits,
      update.amountUsd,
      AUTO_RELOAD_CONSENT_VERSION,
      card.brand,
      card.last4,
    ],
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

async function readProfileEmail(db: DatabaseAdapter, userId: string): Promise<string | null> {
  const [profile] = await db.query<{ email: string | null }>(
    'select email from public.profiles where id = $1 limit 1',
    [userId],
  );
  return profile?.email?.trim() || null;
}

async function readInstrumentForSettings(
  account: TopUpBillingAccount | null,
  userId: string,
): Promise<NormalizedBillingInstrument | null> {
  if (!account) return null;
  try {
    return await readStripeBillingInstrument(account.subscriptionId);
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

function settingsUrl(): string | null {
  const origin = (process.env['NEXT_PUBLIC_APP_URL'] ?? '').trim().replace(/\/$/, '');
  return origin ? `${origin}${BILLING_SETTINGS_PATH}` : null;
}

function htmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function emailReloadConsent(
  userId: string,
  to: string | null,
  consentText: string,
  acceptedAt: string | Date | null,
): Promise<void> {
  if (!isNotificationEmailConfigured()) {
    logger.warn(
      { userId },
      'Auto-reload confirmation email not sent: no transactional email provider is configured',
    );
    return;
  }
  if (!to) {
    logger.warn({ userId }, 'Auto-reload confirmation email not sent: no email on file');
    return;
  }

  const link = settingsUrl();
  const intro =
    'Auto-reload is now on for your AGI Workforce account. These are the terms you agreed to:';
  const action = link
    ? `Turn auto-reload off at any time in Settings > Billing: ${link}`
    : 'Turn auto-reload off at any time in Settings > Billing.';

  const result = await sendTransactionalEmail({
    from: process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim() ?? '',
    to,
    subject: CONSENT_SUBJECT,
    text: [intro, '', consentText, '', action, '', EMAIL_FOOTER].join('\n'),
    html: [
      `<p>${htmlText(intro)}</p>`,
      `<p>${htmlText(consentText)}</p>`,
      link
        ? `<p><a href="${link}">Turn auto-reload off in Settings &gt; Billing</a></p>`
        : `<p>${htmlText(action)}</p>`,
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${htmlText(EMAIL_FOOTER)}</p>`,
    ].join(''),
    idempotencyKey: `auto-reload-consent:${userId}:${acceptedAt ? toIso(acceptedAt) : AUTO_RELOAD_CONSENT_VERSION}`,
  });
  if (!result.delivered) {
    logger.warn(
      { userId, reason: result.reason },
      'Auto-reload confirmation email could not be delivered',
    );
  }
}

export async function saveAutoReloadSettings(
  db: DatabaseAdapter,
  userId: string,
  update: AutoReloadSettingsUpdate,
): Promise<AutoReloadSaveResult> {
  const account = await readTopUpBillingAccount(db, userId);

  if (!update.enabled) {
    const row = await saveDisabledSettings(db, userId, update);
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
  if (instrument.currency !== RELOAD_CURRENCY) {
    throw createError.validation(
      `Auto-reload is billed in USD and your plan is billed in ${instrument.currency ?? 'another currency'}. ` +
        'Upgrade your plan for more included usage, or contact support.',
    );
  }
  if (!instrument.card) return { status: 'payment_method_required' };
  if (update.consentVersion !== AUTO_RELOAD_CONSENT_VERSION) return { status: 'consent_outdated' };

  const consentText = autoReloadConsentText({
    amountUsd: update.amountUsd,
    thresholdCredits: update.thresholdCredits,
    card: instrument.card,
  });
  if (!consentText) throw createError.validation('Choose a valid auto-reload amount.');

  const previous = await readSettingsRow(db, userId);
  const row = await saveConsentedSettings(db, userId, update, instrument.card);
  const termsChanged =
    !previous?.enabled ||
    previous.amount_usd !== update.amountUsd ||
    previous.threshold_credits !== update.thresholdCredits ||
    previous.consent_version !== AUTO_RELOAD_CONSENT_VERSION;
  if (termsChanged) {
    const to = instrument.billingEmail ?? (await readProfileEmail(db, userId));
    runAfterResponse(
      emailReloadConsent(userId, to, consentText, row.consent_accepted_at).catch(
        (error: unknown) => {
          logger.error({ error, userId }, 'Auto-reload confirmation email failed');
        },
      ),
    );
  }
  return { status: 'saved', settings: toAutoReloadSettings(row, instrument.card) };
}

async function readReloadBalanceCredits(db: DatabaseAdapter, userId: string): Promise<number> {
  const balances = await getPrepaidCreditBalances(db, userId);
  return balances.bonusCredits + balances.purchasedCredits;
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
  const to = await readProfileEmail(db, failure.userId);
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

  const result = await sendTransactionalEmail({
    from: process.env['AGI_NOTIFICATIONS_FROM_EMAIL']?.trim() ?? '',
    to,
    subject: FAILURE_SUBJECT,
    text: [headline, '', consequence, '', action, '', EMAIL_FOOTER].join('\n'),
    html: [
      `<p>${htmlText(headline)}</p>`,
      `<p>${htmlText(consequence)}</p>`,
      link
        ? `<p><a href="${link}">Open Settings &gt; Billing</a></p>`
        : `<p>${htmlText(action)}</p>`,
      `<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${htmlText(EMAIL_FOOTER)}</p>`,
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

async function cancelOpenPayment(payment: NormalizedPayment): Promise<void> {
  if (payment.status === 'canceled' || payment.status === 'succeeded') return;
  try {
    await cancelStripePayment(payment.reference);
  } catch (error) {
    logger.warn(
      { error, paymentIntentId: payment.reference },
      'A failed auto-reload PaymentIntent could not be canceled',
    );
  }
}

function readReloadPurchase(payment: NormalizedPayment): ReloadPurchase | null {
  const metadata = payment.metadata;
  const userId = metadata['user_id'];
  const attemptId = metadata['auto_reload_attempt_id'];
  const creditAmountCents = Number(metadata['credit_amount_cents']);
  const taxCents = Number(metadata['tax_cents']);
  const chargedCents = topUpChargedCents({
    conversion: metadata['conversion'],
    amountCents: creditAmountCents,
    units: Number(metadata['top_up_units']),
    priceCents: Number(metadata['price_cents']),
    amountUsd: Number(metadata['amount_usd']),
    autoReload: metadata['auto_reload'] === 'true',
  });
  if (
    !userId ||
    !attemptId ||
    chargedCents === null ||
    !Number.isSafeInteger(taxCents) ||
    taxCents < 0
  ) {
    return null;
  }
  return { userId, attemptId, creditAmountCents, chargedCents, taxCents };
}

export async function settleAutoReloadPayment(
  db: DatabaseAdapter,
  payment: NormalizedPayment,
): Promise<void> {
  const purchase = readReloadPurchase(payment);
  if (!purchase) {
    logger.error(
      { paymentIntentId: payment.reference },
      'Invalid required metadata for auto-reload top-up',
    );
    throw new Error(`Invalid auto-reload metadata for PaymentIntent ${payment.reference}`);
  }

  const expectedCents = purchase.chargedCents + purchase.taxCents;
  if (
    payment.status !== 'succeeded' ||
    payment.amountReceived?.currency !== RELOAD_CURRENCY ||
    payment.amountReceived.minorUnits !== expectedCents
  ) {
    logger.error(
      {
        paymentIntentId: payment.reference,
        userId: purchase.userId,
        status: payment.status,
        expectedCents,
        actualAmountReceived: payment.amountReceived,
      },
      'SECURITY: Auto-reload payment does not match its purchase metadata',
    );
    throw new Error(`Auto-reload payment mismatch for PaymentIntent ${payment.reference}`);
  }

  if (await isCreditTopUpApplied(db, purchase.userId, payment.reference)) {
    logger.info(
      { paymentIntentId: payment.reference, userId: purchase.userId },
      'Auto-reload top-up was already applied',
    );
  } else {
    await grantCreditTopUp(db, {
      userId: purchase.userId,
      creditAmountCents: purchase.creditAmountCents,
      chargedCents: purchase.chargedCents,
      receiptId: payment.reference,
      purchaseCountry: payment.metadata['billing_country'] ?? null,
    });
  }

  await completeReload(db, purchase.userId, purchase.attemptId);
}

export async function failAutoReloadPayment(
  db: DatabaseAdapter,
  payment: NormalizedPayment,
): Promise<void> {
  const userId = payment.metadata['user_id'];
  const attemptId = payment.metadata['auto_reload_attempt_id'];
  if (!userId || !attemptId) {
    logger.error(
      { paymentIntentId: payment.reference },
      'Auto-reload payment failure names no account or attempt',
    );
    return;
  }
  await failReload(db, {
    userId,
    attemptId,
    reason: paymentFailureReason(payment),
    credits: positiveInteger(payment.metadata['top_up_units']),
  });
}

async function settleInTransaction(db: DatabaseAdapter, payment: NormalizedPayment): Promise<void> {
  try {
    await db.transaction((tx) => settleAutoReloadPayment(tx, payment));
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== UNIQUE_VIOLATION) throw error;
    logger.info(
      { paymentIntentId: payment.reference },
      'Auto-reload top-up was granted concurrently by another settlement path',
    );
  }
}

async function resolvePayment(
  db: DatabaseAdapter,
  failure: Omit<ReloadFailure, 'reason'>,
  payment: NormalizedPayment,
): Promise<AutoReloadOutcome> {
  switch (payment.status) {
    case 'succeeded':
      await settleInTransaction(db, payment);
      return 'charged';
    case 'processing':
      await extendLease(db, failure.userId, failure.attemptId);
      return 'processing';
    default:
      await failReload(db, { ...failure, reason: paymentFailureReason(payment) });
      await cancelOpenPayment(payment);
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

function reloadMetadata(
  userId: string,
  attemptId: string,
  quote: TopUpQuote,
  charge: ReloadCharge,
): Record<string, string> {
  return {
    type: 'credit_topup',
    user_id: userId,
    conversion: TOP_UP_CONVERSION,
    amount_usd: String(quote.amountUsd),
    price_cents: String(quote.priceCents),
    discount_percent: String(quote.discountPercent),
    credit_amount_cents: String(quote.budgetCents),
    top_up_units: String(quote.credits),
    tax_cents: String(charge.taxCents),
    tax_calculation: charge.calculationId,
    ...(charge.country ? { billing_country: charge.country } : {}),
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
  let instrument: NormalizedBillingInstrument | null;
  try {
    instrument = await readStripeBillingInstrument(plan.account.subscriptionId);
  } catch (error) {
    logger.warn(
      { error, userId, attemptId },
      'Auto-reload deferred: the saved card could not be read; the lease holds until the sweep retries',
    );
    return 'deferred';
  }
  if (!instrument) {
    await releaseLease(db, userId, attemptId);
    return 'unavailable';
  }
  if (instrument.currency !== RELOAD_CURRENCY) {
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

  let charge: ReloadCharge;
  try {
    const tax = await calculateStripeOffSessionTax({
      customerReference: plan.account.customerId,
      amount: { currency: RELOAD_CURRENCY, minorUnits: plan.quote.priceCents },
      reference: `auto-reload:${attemptId}`,
      idempotencyKey: `auto-reload-tax:${attemptId}`,
    });
    if (tax.outcome === 'location_missing') {
      await failReload(db, { ...failure, reason: 'billing_address_missing' });
      return 'failed';
    }
    charge = {
      amountCents: tax.calculation.total.minorUnits,
      taxCents: tax.calculation.taxMinorUnits,
      calculationId: tax.calculation.reference,
      country: tax.calculation.country,
    };
  } catch (error) {
    logger.error(
      { error, userId, attemptId },
      'Auto-reload deferred: Stripe Tax could not calculate the charge; the lease holds until the sweep retries',
    );
    return 'deferred';
  }

  const receiptEmail = instrument.billingEmail ?? (await readProfileEmail(db, userId));
  if (!receiptEmail) {
    logger.warn({ userId }, 'Auto-reload charge has no email on file to send its receipt to');
  }

  const result = await chargeStripeOffSession({
    customerReference: plan.account.customerId,
    paymentMethodReference: instrument.card.reference,
    amount: { currency: RELOAD_CURRENCY, minorUnits: charge.amountCents },
    description: `AGI auto-reload, ${formatCredits(plan.quote.credits)}`,
    metadata: reloadMetadata(userId, attemptId, plan.quote, charge),
    receiptEmail,
    taxCalculationReference: charge.calculationId,
    idempotencyKey: `auto-reload:${attemptId}`,
  });

  switch (result.outcome) {
    case 'created':
      await recordPaymentIntent(db, userId, attemptId, result.payment.reference);
      await auditReloadCharge(userId, plan.quote, result.payment.reference, null);
      return resolvePayment(db, failure, result.payment);
    case 'declined': {
      const reason = failureReasonOf(result);
      await failReload(db, { ...failure, reason });
      if (result.payment) await cancelOpenPayment(result.payment);
      await auditReloadCharge(userId, plan.quote, result.payment?.reference ?? null, reason);
      return 'failed';
    }
    case 'rejected': {
      const reason =
        result.code === 'resource_missing' ? 'payment_method_missing' : 'payment_failed';
      logger.error(
        { userId, attemptId, code: result.code, message: result.message },
        'Stripe refused the auto-reload charge request',
      );
      await failReload(db, { ...failure, reason });
      await auditReloadCharge(userId, plan.quote, null, reason);
      return 'failed';
    }
    case 'unknown':
      logger.warn(
        { error: result.error, userId, attemptId },
        'Auto-reload charge outcome is unknown; the sweep reconciles it once the lease expires',
      );
      return 'deferred';
  }
}

async function findAttemptPayment(
  db: DatabaseAdapter,
  userId: string,
  attemptId: string,
  startedAt: string | Date | null,
): Promise<NormalizedPayment | null> {
  const [billing] = await db.query<Pick<SubscriptionRow, 'stripe_customer_id'>>(
    'select stripe_customer_id from public.subscriptions where user_id = $1 limit 1',
    [userId],
  );
  const customerId = billing?.stripe_customer_id;
  if (!isStripeCustomerId(customerId)) return null;
  const since = startedAt
    ? new Date(new Date(startedAt).getTime() - ATTEMPT_LOOKUP_SLACK_SECONDS * 1000)
    : null;
  const payments = await listStripeCustomerPayments(customerId, since, ATTEMPT_LOOKUP_LIMIT);
  return (
    payments.find((payment) => payment.metadata['auto_reload_attempt_id'] === attemptId) ?? null
  );
}

async function recoverReload(
  db: DatabaseAdapter,
  userId: string,
  attemptId: string,
  row: AutoReloadRow,
): Promise<AutoReloadOutcome> {
  const payment = row.reload_payment_intent_id
    ? await retrieveStripePayment(row.reload_payment_intent_id)
    : await findAttemptPayment(db, userId, attemptId, row.last_attempt_at);
  if (!payment) {
    await releaseLease(db, userId, attemptId);
    return 'released';
  }

  logger.info(
    { userId, attemptId, paymentIntentId: payment.reference, status: payment.status },
    'Reconciling an auto-reload whose lease expired before it settled',
  );
  return resolvePayment(
    db,
    { userId, attemptId, credits: positiveInteger(payment.metadata['top_up_units']) },
    payment,
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
  runAfterResponse(
    runAutoReload(userId).then(
      () => undefined,
      (error: unknown) => {
        logger.error({ error, userId }, 'Auto-reload check failed');
      },
    ),
  );
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

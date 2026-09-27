import 'server-only';

import Stripe from 'stripe';

import type {
  BillingRefund,
  RefundStatus,
  TopUpReceipt,
  TopUpReceiptStatus,
} from '@/features/billing/lib/billing-account-types';
import { buildPaymentIntentTaxCalculationParams } from '@/lib/billing/tax-policy';
import { logger } from '@/lib/logger';
import { getStripeClient, getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  isStripeCheckoutSessionId,
  isStripeResourceMissing,
  isStripeSubscriptionId,
} from '@/lib/server/stripe-resource-ids';
import { getSubscriptionPeriod } from '@/lib/stripe-types';

import type {
  ChargeRefundInput,
  ChargeRefundResult,
  NormalizedBalanceEntry,
  NormalizedBillingInstrument,
  NormalizedCard,
  NormalizedCharge,
  NormalizedChargeAttribution,
  NormalizedCostActivity,
  NormalizedInvoiceDiscount,
  NormalizedMoney,
  NormalizedPayment,
  NormalizedPaymentStatus,
  NormalizedPeriod,
  NormalizedPurchase,
  NormalizedSubscription,
  OffSessionChargeInput,
  OffSessionChargeResult,
  PollablePaymentProvider,
  PurchaseVerificationInput,
  TaxCalculationResult,
} from './domain';
import {
  normalizeCurrency,
  normalizeEnvironment,
  normalizeInterval,
  normalizeMoney,
  normalizeProviderPeriod,
  normalizeProviderQuantity,
  normalizeProviderTimestamp,
  normalizeSubscriptionStatus,
} from './normalize';

const PROVIDER_ID = 'stripe' as const;
const OWNER_METADATA_KEY = 'user_id';
const PLAN_TIER_METADATA_KEY = 'plan_tier';

const CAPABILITIES = {
  pollsSubscriptionState: true,
  hostedBillingPortal: true,
} as const;

function referenceOf(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : (value.id ?? null);
}

function stripeEnvironment(livemode: boolean | null | undefined): 'production' | 'sandbox' {
  return normalizeEnvironment(livemode === false ? 'sandbox' : 'production');
}

export function normalizeStripeSubscription(
  subscription: Stripe.Subscription,
): NormalizedSubscription {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const period = getSubscriptionPeriod(subscription);
  const { status, mapped } = normalizeSubscriptionStatus(PROVIDER_ID, subscription.status);
  if (!mapped) {
    logger.error(
      { subscriptionId: subscription.id, status: subscription.status },
      'Unknown Stripe subscription status; normalized to unpaid so no unearned entitlement is granted',
    );
  }

  return {
    provider: PROVIDER_ID,
    subscriptionReference: subscription.id,
    customerReference: referenceOf(subscription.customer as string | { id?: string } | null),
    ownerReference: subscription.metadata?.[OWNER_METADATA_KEY]?.trim() || null,
    plan: {
      productReference: referenceOf(price?.product as string | { id?: string } | null | undefined),
      priceReference: price?.id ?? null,
    },
    status,
    period: period ? normalizeProviderPeriod(period.start, period.end) : null,
    interval: normalizeInterval(price?.recurring?.interval, price?.recurring?.interval_count),
    quantity: normalizeProviderQuantity(item?.quantity),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    endedAt: normalizeProviderTimestamp(subscription.ended_at),
    environment: stripeEnvironment(subscription.livemode),
  };
}

export function normalizeStripeCheckoutSession(
  session: Stripe.Checkout.Session,
): NormalizedPurchase {
  const state =
    session.payment_status === 'paid'
      ? 'paid'
      : session.status === 'complete'
        ? 'confirmed'
        : session.status === 'expired'
          ? 'expired'
          : 'processing';

  return {
    provider: PROVIDER_ID,
    purchaseReference: session.id,
    ownerReference:
      session.client_reference_id ?? session.metadata?.[OWNER_METADATA_KEY]?.trim() ?? null,
    plan: {
      productReference: null,
      priceReference: referenceOf(
        session.line_items?.data?.[0]?.price as string | { id?: string } | null | undefined,
      ),
    },
    planTier: session.metadata?.[PLAN_TIER_METADATA_KEY]?.trim() || null,
    state,
    purchasedAt: normalizeProviderTimestamp(session.created),
    expiresAt: normalizeProviderTimestamp(session.expires_at),
    quantity: normalizeProviderQuantity(1),
    amount: normalizeMoney(session.amount_total, normalizeCurrency(session.currency)),
    environment: stripeEnvironment(session.livemode),
  };
}

const PAYMENT_STATUSES: ReadonlySet<string> = new Set<NormalizedPaymentStatus>([
  'succeeded',
  'processing',
  'requires_action',
  'requires_payment_method',
  'requires_confirmation',
  'requires_capture',
  'canceled',
]);

export function normalizeStripePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): NormalizedPayment {
  const status = PAYMENT_STATUSES.has(paymentIntent.status)
    ? (paymentIntent.status as NormalizedPaymentStatus)
    : 'unknown';
  if (status === 'unknown') {
    logger.error(
      { paymentIntentId: paymentIntent.id, status: paymentIntent.status },
      'Unknown Stripe PaymentIntent status; normalized to unknown so it is never treated as paid',
    );
  }
  return {
    reference: paymentIntent.id,
    status,
    amountReceived: normalizeMoney(paymentIntent.amount_received, paymentIntent.currency),
    metadata: { ...(paymentIntent.metadata ?? {}) },
    failureCode: paymentIntent.last_payment_error?.code ?? null,
    declineCode: paymentIntent.last_payment_error?.decline_code ?? null,
  };
}

function normalizeCard(
  method: string | Stripe.PaymentMethod | null | undefined,
): NormalizedCard | null {
  if (!method || typeof method === 'string' || method.type !== 'card' || !method.card) return null;
  return { reference: method.id, brand: method.card.brand, last4: method.card.last4 };
}

function liveCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): Stripe.Customer | null {
  if (typeof customer === 'string' || customer.deleted === true) return null;
  return customer;
}

export async function readStripeBillingInstrument(
  subscriptionReference: string,
): Promise<NormalizedBillingInstrument | null> {
  const stripe = getStripeClientOrNull();
  if (!stripe) return null;
  const subscription = await stripe.subscriptions.retrieve(subscriptionReference, {
    expand: ['default_payment_method', 'customer.invoice_settings.default_payment_method'],
  });
  const customer = liveCustomer(subscription.customer);
  return {
    currency: normalizeCurrency(subscription.currency),
    card: subscription.default_payment_method
      ? normalizeCard(subscription.default_payment_method)
      : normalizeCard(customer?.invoice_settings?.default_payment_method),
    billingEmail: customer?.email?.trim() || null,
  };
}

function isTaxLocationMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeError && error.code === 'customer_tax_location_invalid'
  );
}

export async function calculateStripeOffSessionTax(input: {
  customerReference: string;
  amount: NormalizedMoney;
  reference: string;
  idempotencyKey: string;
}): Promise<TaxCalculationResult> {
  try {
    const calculation = await getStripeClient().tax.calculations.create(
      buildPaymentIntentTaxCalculationParams({
        customerId: input.customerReference,
        currency: input.amount.currency.toLowerCase(),
        amountMinor: input.amount.minorUnits,
        reference: input.reference,
      }),
      { idempotencyKey: input.idempotencyKey },
    );
    const total = normalizeMoney(calculation.amount_total, calculation.currency);
    if (!calculation.id || !total) {
      throw new Error('Stripe Tax returned a calculation without an id or a total');
    }
    return {
      outcome: 'calculated',
      calculation: {
        reference: calculation.id,
        total,
        taxMinorUnits: calculation.tax_amount_exclusive,
        country: calculation.customer_details.address?.country ?? null,
      },
    };
  } catch (error) {
    if (isTaxLocationMissing(error)) return { outcome: 'location_missing' };
    throw error;
  }
}

export async function chargeStripeOffSession(
  input: OffSessionChargeInput,
): Promise<OffSessionChargeResult> {
  try {
    const paymentIntent = await getStripeClient().paymentIntents.create(
      {
        amount: input.amount.minorUnits,
        currency: input.amount.currency.toLowerCase(),
        customer: input.customerReference,
        payment_method: input.paymentMethodReference,
        payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        description: input.description,
        metadata: { ...input.metadata },
        hooks: { inputs: { tax: { calculation: input.taxCalculationReference } } },
        ...(input.receiptEmail ? { receipt_email: input.receiptEmail } : {}),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { outcome: 'created', payment: normalizeStripePaymentIntent(paymentIntent) };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeCardError) {
      return {
        outcome: 'declined',
        payment: error.payment_intent ? normalizeStripePaymentIntent(error.payment_intent) : null,
        failureCode: error.code ?? null,
        declineCode: error.decline_code ?? null,
      };
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return { outcome: 'rejected', code: error.code ?? null, message: error.message };
    }
    return { outcome: 'unknown', error };
  }
}

export async function cancelStripePayment(reference: string): Promise<void> {
  await getStripeClient().paymentIntents.cancel(reference);
}

export async function retrieveStripePayment(reference: string): Promise<NormalizedPayment | null> {
  try {
    return normalizeStripePaymentIntent(await getStripeClient().paymentIntents.retrieve(reference));
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

export async function listStripeCustomerPayments(
  customerReference: string,
  createdSince: Date | null,
  limit: number,
): Promise<NormalizedPayment[]> {
  const page = await getStripeClient().paymentIntents.list({
    customer: customerReference,
    limit,
    ...(createdSince ? { created: { gte: Math.floor(createdSince.getTime() / 1000) } } : {}),
  });
  return page.data.map(normalizeStripePaymentIntent);
}

const COST_ACTIVITY_PAGE = 100;
const PAYMENT_TYPE_METADATA_KEY = 'type';
const TOP_UP_PAYMENT_TYPE = 'credit_topup';

function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function chargeSourceOf(transaction: Stripe.BalanceTransaction): Stripe.Charge | null {
  const source = transaction.source;
  if (!source || typeof source === 'string' || source.object !== 'charge') return null;
  return source;
}

function subscriptionAttributionOf(
  payment: Stripe.InvoicePayment,
): NormalizedChargeAttribution | null {
  const invoice = payment.invoice;
  if (typeof invoice === 'string' || invoice.deleted === true) return null;
  const details = invoice.parent?.subscription_details;
  const reference = referenceOf(details?.subscription as string | { id?: string } | undefined);
  if (!details || !reference) return null;
  return {
    kind: 'subscription',
    reference,
    ownerReference: details.metadata?.[OWNER_METADATA_KEY]?.trim() || null,
  };
}

function topUpAttributionOf(charge: Stripe.Charge): NormalizedChargeAttribution | null {
  if (charge.metadata?.[PAYMENT_TYPE_METADATA_KEY] !== TOP_UP_PAYMENT_TYPE) return null;
  return {
    kind: 'top_up',
    reference: referenceOf(charge.payment_intent as string | { id?: string } | null) ?? charge.id,
    ownerReference: charge.metadata[OWNER_METADATA_KEY]?.trim() || null,
  };
}

async function subscriptionAttributionForPayment(
  stripe: Stripe,
  paymentIntentReference: string,
): Promise<NormalizedChargeAttribution | null> {
  const found: NormalizedChargeAttribution[] = [];
  await stripe.invoicePayments
    .list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentReference },
      expand: ['data.invoice'],
      limit: 1,
    })
    .autoPagingEach((payment) => {
      const attribution = subscriptionAttributionOf(payment);
      if (attribution) found.push(attribution);
    });
  return found[0] ?? null;
}

async function attributeCharge(
  stripe: Stripe,
  charge: Stripe.Charge,
  subscriptionPayments: Map<string, NormalizedChargeAttribution>,
): Promise<NormalizedChargeAttribution | null> {
  const topUp = topUpAttributionOf(charge);
  if (topUp) return topUp;
  const paymentIntentReference = referenceOf(
    charge.payment_intent as string | { id?: string } | null,
  );
  if (!paymentIntentReference) return null;
  const known = subscriptionPayments.get(paymentIntentReference);
  if (known) return known;
  const looked = await subscriptionAttributionForPayment(stripe, paymentIntentReference);
  if (looked) subscriptionPayments.set(paymentIntentReference, looked);
  return looked;
}

export async function readStripeCostActivity(window: {
  since: Date;
  until: Date;
}): Promise<NormalizedCostActivity | null> {
  const stripe = getStripeClientOrNull();
  if (!stripe) return null;
  const created = { gte: unixSeconds(window.since), lt: unixSeconds(window.until) };

  const transactions: Stripe.BalanceTransaction[] = [];
  await stripe.balanceTransactions
    .list({ created, limit: COST_ACTIVITY_PAGE, expand: ['data.source'] })
    .autoPagingEach((transaction) => {
      transactions.push(transaction);
    });

  const subscriptionPayments = new Map<string, NormalizedChargeAttribution>();
  await stripe.invoicePayments
    .list({ created, status: 'paid', expand: ['data.invoice'], limit: COST_ACTIVITY_PAGE })
    .autoPagingEach((payment) => {
      const reference = referenceOf(
        payment.payment.payment_intent as string | { id?: string } | undefined,
      );
      const attribution = subscriptionAttributionOf(payment);
      if (reference && attribution) subscriptionPayments.set(reference, attribution);
    });

  const balanceEntries: NormalizedBalanceEntry[] = [];
  for (const transaction of transactions) {
    const charge = chargeSourceOf(transaction);
    balanceEntries.push({
      reference: transaction.id,
      type: transaction.type,
      occurredAt: new Date(transaction.created * 1000),
      currency: transaction.currency,
      amountMinorUnits: transaction.amount,
      feeMinorUnits: transaction.fee,
      chargeReference: charge?.id ?? null,
      attribution:
        charge && transaction.fee > 0
          ? await attributeCharge(stripe, charge, subscriptionPayments)
          : null,
    });
  }

  const invoiceDiscounts: NormalizedInvoiceDiscount[] = [];
  await stripe.invoices.list({ created, limit: COST_ACTIVITY_PAGE }).autoPagingEach((invoice) => {
    const lines = invoice.total_discount_amounts ?? [];
    const discountMinorUnits = lines.reduce((total, line) => total + Math.max(0, line.amount), 0);
    if (discountMinorUnits <= 0) return;
    invoiceDiscounts.push({
      invoiceReference: invoice.id,
      occurredAt: new Date(invoice.created * 1000),
      currency: invoice.currency,
      discountMinorUnits,
      discountReferences: lines.flatMap((line) => {
        const reference = referenceOf(line.discount as string | { id?: string });
        return reference ? [reference] : [];
      }),
    });
  });

  return { balanceEntries, invoiceDiscounts };
}

const CREDIT_AMOUNT_METADATA_KEY = 'credit_amount_cents';
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const ENDED_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'incomplete_expired',
]);

function countryCodeOf(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && COUNTRY_CODE_PATTERN.test(code) ? code : null;
}

function purchasedLedgerCentsOf(charge: Stripe.Charge): number | null {
  const cents = Number(charge.metadata?.[CREDIT_AMOUNT_METADATA_KEY]);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function normalizeStripeCharge(charge: Stripe.Charge): NormalizedCharge | null {
  const amount = normalizeMoney(charge.amount, charge.currency);
  if (!amount) return null;
  const topUp = charge.metadata?.[PAYMENT_TYPE_METADATA_KEY] === TOP_UP_PAYMENT_TYPE;
  return {
    reference: charge.id,
    paymentReference: referenceOf(charge.payment_intent as string | { id?: string } | null),
    customerReference: referenceOf(charge.customer as string | { id?: string } | null),
    kind: topUp ? 'top_up' : 'subscription',
    amount,
    refundedMinorUnits: charge.amount_refunded,
    createdAt: new Date(charge.created * 1000),
    settled: charge.status === 'succeeded' && charge.paid,
    disputed: charge.disputed,
    billingCountry: countryCodeOf(charge.billing_details?.address?.country),
    cardCountry: countryCodeOf(charge.payment_method_details?.card?.country),
    receiptUrl: charge.receipt_url ?? null,
    purchasedLedgerCents: topUp ? purchasedLedgerCentsOf(charge) : null,
  };
}

export function isStripeConfigured(): boolean {
  return getStripeClientOrNull() !== null;
}

export async function retrieveStripeCharge(reference: string): Promise<NormalizedCharge | null> {
  try {
    return normalizeStripeCharge(await getStripeClient().charges.retrieve(reference));
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

export async function listStripeCustomerCharges(
  customerReference: string,
  limit: number,
): Promise<NormalizedCharge[]> {
  const page = await getStripeClient().charges.list({ customer: customerReference, limit });
  return page.data.flatMap((charge) => {
    const normalized = normalizeStripeCharge(charge);
    return normalized ? [normalized] : [];
  });
}

export async function readStripePaymentCustomer(paymentReference: string): Promise<string | null> {
  try {
    const paymentIntent = await getStripeClient().paymentIntents.retrieve(paymentReference);
    return referenceOf(paymentIntent.customer as string | { id?: string } | null);
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

export async function readStripeCustomerCountry(customerReference: string): Promise<string | null> {
  try {
    const customer = await getStripeClient().customers.retrieve(customerReference, {
      expand: ['tax'],
    });
    if (customer.deleted === true) return null;
    return (
      countryCodeOf(customer.address?.country) ??
      countryCodeOf(customer.tax?.location?.country) ??
      countryCodeOf(customer.shipping?.address?.country)
    );
  } catch (error) {
    if (isStripeResourceMissing(error)) return null;
    throw error;
  }
}

export async function readStripePaymentServicePeriod(
  paymentReference: string,
): Promise<NormalizedPeriod | null> {
  const payments = await getStripeClient().invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentReference },
    expand: ['data.invoice'],
    limit: 1,
  });
  const invoice = payments.data[0]?.invoice;
  if (!invoice || typeof invoice === 'string' || invoice.deleted === true) return null;
  const latest = (invoice.lines?.data ?? []).reduce<Stripe.InvoiceLineItem | null>(
    (found, line) => (found === null || line.period.end > found.period.end ? line : found),
    null,
  );
  return latest ? normalizeProviderPeriod(latest.period.start, latest.period.end) : null;
}

export async function refundStripeCharge(input: ChargeRefundInput): Promise<ChargeRefundResult> {
  let refund: Stripe.Refund;
  try {
    refund = await getStripeClient().refunds.create(
      {
        charge: input.chargeReference,
        amount: input.amountMinorUnits,
        reason: input.reason,
        metadata: { ...input.metadata },
      },
      { idempotencyKey: input.idempotencyKey },
    );
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return { outcome: 'rejected', code: error.code ?? null };
    }
    throw error;
  }
  const amount = normalizeMoney(refund.amount, refund.currency);
  if (!amount) throw new Error(`Stripe returned refund ${refund.id} without an amount`);
  return {
    outcome: 'refunded',
    refund: { reference: refund.id, status: refund.status ?? null, amount },
  };
}

export async function cancelStripeSubscriptionNow(subscriptionReference: string): Promise<boolean> {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionReference);
  if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) return false;
  await stripe.subscriptions.cancel(subscriptionReference, { prorate: false, invoice_now: false });
  return true;
}

export const stripePaymentProvider: PollablePaymentProvider = {
  id: PROVIDER_ID,
  capabilities: CAPABILITIES,

  async verifyPurchase(input: PurchaseVerificationInput): Promise<NormalizedPurchase> {
    if (!isStripeCheckoutSessionId(input.reference)) {
      throw new Error('A Stripe checkout session reference is required.');
    }
    const session = await getStripeClient().checkout.sessions.retrieve(input.reference);
    return normalizeStripeCheckoutSession(session);
  },

  async readSubscription(reference: string): Promise<NormalizedSubscription | null> {
    if (!isStripeSubscriptionId(reference)) return null;
    const stripe = getStripeClientOrNull();
    if (!stripe) return null;
    const subscription = await stripe.subscriptions.retrieve(reference);
    return normalizeStripeSubscription(subscription);
  },
};

const PAYMENT_HISTORY_LIMIT = 100;

const REFUND_STATUS: Readonly<Record<string, RefundStatus>> = {
  pending: 'processing',
  requires_action: 'action_required',
  succeeded: 'refunded',
  failed: 'failed',
  canceled: 'canceled',
};

export interface PaymentHistory {
  receipts: TopUpReceipt[];
  refunds: BillingRefund[];
}

function isoFromSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function topUpCredits(metadata: Stripe.Metadata | null | undefined): number | null {
  const credits = Number(metadata?.['top_up_units']);
  return Number.isSafeInteger(credits) && credits > 0 ? credits : null;
}

function isTopUp(paymentIntent: Stripe.PaymentIntent): boolean {
  return paymentIntent.metadata?.[PAYMENT_TYPE_METADATA_KEY] === TOP_UP_PAYMENT_TYPE;
}

function chargeOf(paymentIntent: Stripe.PaymentIntent): Stripe.Charge | null {
  const charge = paymentIntent.latest_charge;
  return charge && typeof charge !== 'string' ? charge : null;
}

function receiptStatusOf(
  paymentIntent: Stripe.PaymentIntent,
  charge: Stripe.Charge | null,
): TopUpReceiptStatus | null {
  if (paymentIntent.status === 'processing') return 'processing';
  if (paymentIntent.status !== 'succeeded') return null;
  if (charge?.refunded) return 'refunded';
  return charge && charge.amount_refunded > 0 ? 'partially_refunded' : 'paid';
}

function receiptOf(paymentIntent: Stripe.PaymentIntent): TopUpReceipt | null {
  const charge = chargeOf(paymentIntent);
  const status = receiptStatusOf(paymentIntent, charge);
  if (!status) return null;
  return {
    id: paymentIntent.id,
    createdAt: isoFromSeconds(paymentIntent.created),
    credits: topUpCredits(paymentIntent.metadata),
    amountCents: charge?.amount ?? paymentIntent.amount,
    refundedCents: charge?.amount_refunded ?? 0,
    currency: paymentIntent.currency,
    status,
    autoReload: paymentIntent.metadata?.['auto_reload'] === 'true',
    receiptUrl: charge?.receipt_url ?? null,
  };
}

function refundsOf(paymentIntent: Stripe.PaymentIntent): BillingRefund[] {
  const charge = chargeOf(paymentIntent);
  if (!charge) return [];
  const topUp = isTopUp(paymentIntent);
  return (charge.refunds?.data ?? []).flatMap((refund) => {
    const status = refund.status ? REFUND_STATUS[refund.status] : undefined;
    if (!status) return [];
    return [
      {
        id: refund.id,
        createdAt: isoFromSeconds(refund.created),
        amountCents: refund.amount,
        currency: refund.currency,
        status,
        kind: topUp ? 'top_up' : 'plan',
        credits: topUp ? topUpCredits(paymentIntent.metadata) : null,
        paymentCreatedAt: isoFromSeconds(charge.created),
        receiptUrl: charge.receipt_url ?? null,
      },
    ];
  });
}

export async function readPaymentHistory(
  stripe: Stripe,
  customerId: string,
): Promise<PaymentHistory> {
  const page = await stripe.paymentIntents.list({
    customer: customerId,
    limit: PAYMENT_HISTORY_LIMIT,
    expand: ['data.latest_charge.refunds'],
  });

  return {
    receipts: page.data
      .filter(isTopUp)
      .map(receiptOf)
      .filter((receipt): receipt is TopUpReceipt => receipt !== null),
    refunds: page.data
      .flatMap(refundsOf)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

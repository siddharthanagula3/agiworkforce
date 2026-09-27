import 'server-only';

import Stripe from 'stripe';

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
  NormalizedBillingInstrument,
  NormalizedCard,
  NormalizedMoney,
  NormalizedPayment,
  NormalizedPaymentStatus,
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

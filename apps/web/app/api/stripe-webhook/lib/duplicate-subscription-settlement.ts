import 'server-only';

import type Stripe from 'stripe';
import { z } from 'zod';

import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';

const STRIPE_PAGE_SIZE = 100;
const STRIPE_METADATA_VALUE_LIMIT = 500;
const COLLECTION_SNAPSHOT_KEY = 'agi_duplicate_collection';
const REFUND_PAYMENT_KEY = 'duplicate_invoice_payment_id';
const CollectionSnapshotSchema = z.object({
  kept: z.string().refine(isStripeSubscriptionId),
  invoices: z.array(z.string().min(1)),
  refunds: z.number().int().nonnegative(),
  complete: z.boolean(),
});

type CollectionSnapshot = z.infer<typeof CollectionSnapshotSchema>;
type StripeRefundTarget = { payment_intent: string } | { charge: string };

function stripeReference(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function refundTargetOf(payment: Stripe.InvoicePayment.Payment): StripeRefundTarget | null {
  if (payment.type === 'payment_intent') {
    const paymentIntent = stripeReference(payment.payment_intent);
    return paymentIntent ? { payment_intent: paymentIntent } : null;
  }
  if (payment.type === 'charge') {
    const charge = stripeReference(payment.charge);
    return charge ? { charge } : null;
  }
  return null;
}

export async function duplicateRefundAmount(
  stripe: Stripe,
  charge: Stripe.Charge,
  keptSubscriptionId: string | null,
): Promise<number> {
  const refunds =
    charge.refunds && !charge.refunds.has_more
      ? charge.refunds
      : await stripe.refunds.list({ charge: charge.id, limit: STRIPE_PAGE_SIZE });
  if (refunds.has_more) throw new Error('Charge refunds exceed the settlement limit');
  const amount = refunds.data
    .filter(
      (refund) =>
        (refund.status === 'succeeded' ||
          refund.status === 'pending' ||
          refund.status === 'requires_action') &&
        isStripeSubscriptionId(refund.metadata?.['duplicate_subscription_id']) &&
        refund.metadata?.['duplicate_subscription_id'] !== keptSubscriptionId &&
        !!refund.metadata?.[REFUND_PAYMENT_KEY],
    )
    .reduce((sum, refund) => sum + refund.amount, 0);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > charge.amount ||
    amount > charge.amount_refunded
  ) {
    throw new Error('Duplicate refund receipts exceed the charge refund snapshot');
  }
  return amount;
}

export function duplicateCollectionSnapshot(
  subscription: Stripe.Subscription,
): CollectionSnapshot | null {
  const stored = subscription.metadata[COLLECTION_SNAPSHOT_KEY];
  return stored ? CollectionSnapshotSchema.parse(JSON.parse(stored)) : null;
}

async function refundDuplicateSubscriptionInvoice(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<number> {
  const invoiceId = stripeReference(subscription.latest_invoice);
  if (!invoiceId) return 0;
  const payments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    status: 'paid',
    limit: STRIPE_PAGE_SIZE,
  });
  if (payments.has_more) throw new Error('Duplicate invoice payments exceed the settlement limit');

  let refunded = 0;
  for (const invoicePayment of payments.data) {
    const target = refundTargetOf(invoicePayment.payment);
    const amount = invoicePayment.amount_paid;
    if (!target || amount === null || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error('Duplicate invoice payment has no verifiable refundable allocation');
    }
    const refunds = await stripe.refunds.list({ ...target, limit: STRIPE_PAGE_SIZE });
    if (refunds.has_more) throw new Error('Payment refunds exceed the settlement limit');
    const allocatedRefunds = refunds.data.filter(
      (refund) =>
        refund.metadata?.['duplicate_subscription_id'] === subscription.id &&
        refund.metadata?.[REFUND_PAYMENT_KEY] === invoicePayment.id,
    );
    if (allocatedRefunds.some((refund) => refund.status !== 'succeeded')) {
      throw new Error('Duplicate invoice refund needs payment-provider resolution');
    }
    const alreadyRefunded = allocatedRefunds.reduce((sum, refund) => sum + refund.amount, 0);
    if (!Number.isSafeInteger(alreadyRefunded) || alreadyRefunded > amount) {
      throw new Error('Duplicate invoice refund exceeds its paid allocation');
    }
    if (alreadyRefunded < amount) {
      const refund = await stripe.refunds.create(
        {
          ...target,
          amount: amount - alreadyRefunded,
          reason: 'duplicate',
          metadata: {
            duplicate_subscription_id: subscription.id,
            [REFUND_PAYMENT_KEY]: invoicePayment.id,
          },
        },
        {
          idempotencyKey: `duplicate-subscription-refund:${invoicePayment.id}:${alreadyRefunded}`,
        },
      );
      if (refund.status !== 'succeeded') {
        throw new Error('Duplicate invoice refund has not succeeded');
      }
    }
    refunded += 1;
  }
  return refunded;
}

async function storeCollectionSnapshot(
  stripe: Stripe,
  subscriptionId: string,
  snapshot: CollectionSnapshot,
): Promise<void> {
  const value = JSON.stringify(snapshot);
  if (value.length > STRIPE_METADATA_VALUE_LIMIT) {
    throw new Error('Kept invoice collection state exceeds the settlement limit');
  }
  await stripe.subscriptions.update(subscriptionId, {
    metadata: { [COLLECTION_SNAPSHOT_KEY]: value },
  });
}

async function captureCollectionSnapshot(
  stripe: Stripe,
  incoming: Stripe.Subscription,
  kept: Stripe.Subscription,
): Promise<CollectionSnapshot> {
  const invoices = await stripe.invoices.list({
    subscription: kept.id,
    status: 'open',
    limit: STRIPE_PAGE_SIZE,
  });
  if (invoices.has_more) throw new Error('Kept invoices exceed the settlement limit');
  if (
    invoices.data.some(
      (invoice) =>
        stripeReference(invoice.parent?.subscription_details?.subscription) !== kept.id ||
        stripeReference(invoice.customer) !== stripeReference(kept.customer),
    )
  ) {
    throw new Error('Kept invoice does not belong to the tracked subscription and customer');
  }
  const snapshot: CollectionSnapshot = {
    kept: kept.id,
    invoices: invoices.data
      .filter(
        (invoice) =>
          invoice.auto_advance === true &&
          stripeReference(invoice.customer) === stripeReference(incoming.customer),
      )
      .map((invoice) => invoice.id),
    refunds: 0,
    complete: false,
  };
  if (JSON.stringify(snapshot).length > STRIPE_METADATA_VALUE_LIMIT) {
    throw new Error('Kept invoice collection state exceeds the settlement limit');
  }
  snapshot.refunds = await refundDuplicateSubscriptionInvoice(stripe, incoming);
  await storeCollectionSnapshot(stripe, incoming.id, snapshot);
  return snapshot;
}

async function restoreCollectionSnapshot(
  stripe: Stripe,
  incoming: Stripe.Subscription,
  snapshot: CollectionSnapshot,
): Promise<void> {
  const kept = await stripe.subscriptions.retrieve(snapshot.kept);
  if (kept.status === 'active' || kept.status === 'trialing' || kept.status === 'past_due') {
    for (const invoiceId of snapshot.invoices) {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      if (
        stripeReference(invoice.customer) !== stripeReference(incoming.customer) ||
        stripeReference(invoice.parent?.subscription_details?.subscription) !== kept.id
      ) {
        throw new Error('Kept invoice does not belong to the recorded subscription and customer');
      }
      if (invoice.status === 'open' && invoice.auto_advance !== true) {
        await stripe.invoices.update(
          invoice.id,
          { auto_advance: true },
          { idempotencyKey: `duplicate-subscription-collection:${incoming.id}:${invoice.id}` },
        );
      }
    }
  }
  await storeCollectionSnapshot(stripe, incoming.id, { ...snapshot, complete: true });
}

export async function cancelDuplicateSubscription(
  stripe: Stripe,
  incoming: Stripe.Subscription,
  kept: Stripe.Subscription | null,
): Promise<number> {
  let snapshot = duplicateCollectionSnapshot(incoming);
  if (!snapshot) {
    if (!kept) throw new Error('Duplicate subscription has no tracked collection state');
    snapshot = await captureCollectionSnapshot(stripe, incoming, kept);
  }
  if (snapshot.complete) {
    if (incoming.status !== 'canceled') {
      throw new Error('Settled duplicate subscription is still live');
    }
    return snapshot.refunds;
  }
  if (incoming.status !== 'canceled') {
    await stripe.subscriptions.cancel(
      incoming.id,
      { prorate: false, invoice_now: false },
      { idempotencyKey: `duplicate-subscription-cancel:${incoming.id}` },
    );
  }
  await restoreCollectionSnapshot(stripe, incoming, snapshot);
  return snapshot.refunds;
}

import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

import { isStripeSubscriptionId } from '@/lib/server/stripe-resource-ids';
import type { Stripe } from '@/lib/stripe-types';

export const STRIPE_PAGE_SIZE = 100;
const STRIPE_METADATA_VALUE_LIMIT = 500;
const STRIPE_METADATA_KEY_LIMIT = 50;
const COLLECTION_SNAPSHOT_KEY = 'agi_duplicate_collection';
const REFUND_PAYMENT_KEY = 'duplicate_invoice_payment_id';
const CollectionSnapshotSchema = z.object({
  kept: z.string().refine(isStripeSubscriptionId),
  customer: z.string().min(1),
  invoices: z.array(
    z.object({
      id: z.string().min(1),
      subscription: z.string().refine(isStripeSubscriptionId).nullable(),
    }),
  ),
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

export function duplicateRefundAmount(
  charge: Stripe.Charge,
  keptSubscriptionId: string | null,
  otherAllocations: readonly { id: string; amount: number; subscription: string | null }[],
): number {
  const refunds = (charge as Stripe.Charge & { refunds?: Stripe.ApiList<Stripe.Refund> | null })
    .refunds;
  if (!refunds || refunds.has_more)
    throw new Error('Shared payment refunds need a complete signed charge snapshot');
  const active = refunds.data.filter(
    (refund) =>
      refund.status === 'succeeded' ||
      refund.status === 'pending' ||
      refund.status === 'requires_action',
  );
  const seen = new Set<string>();
  if (
    active.some((refund) => {
      if (!refund.id || seen.has(refund.id)) return true;
      seen.add(refund.id);
      return (
        !Number.isSafeInteger(refund.amount) ||
        refund.amount <= 0 ||
        stripeReference(refund.charge) !== charge.id
      );
    })
  ) {
    throw new Error('Signed refund receipts have invalid charge allocations');
  }
  const total = active.reduce((sum, refund) => sum + refund.amount, 0);
  if (!Number.isSafeInteger(total) || total !== charge.amount_refunded) {
    throw new Error('Signed refund receipts do not match the charge refund snapshot');
  }
  const duplicates = active.filter((refund) => !!refund.metadata?.['duplicate_subscription_id']);
  for (const refund of duplicates) {
    const allocation = otherAllocations.find(
      (payment) => payment.id === refund.metadata?.[REFUND_PAYMENT_KEY],
    );
    if (
      !allocation ||
      !isStripeSubscriptionId(allocation.subscription) ||
      allocation.subscription === keptSubscriptionId ||
      allocation.subscription !== refund.metadata?.['duplicate_subscription_id']
    ) {
      throw new Error('Duplicate refund does not belong to a proven other invoice allocation');
    }
  }
  const amount = duplicates.reduce((sum, refund) => sum + refund.amount, 0);
  for (const allocation of otherAllocations) {
    const settled = duplicates
      .filter((refund) => refund.metadata?.[REFUND_PAYMENT_KEY] === allocation.id)
      .reduce((sum, refund) => sum + refund.amount, 0);
    if (settled !== allocation.amount)
      throw new Error('Shared payment refund attribution is ambiguous');
  }
  if (!Number.isSafeInteger(amount) || amount > charge.amount_refunded) {
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

function collectionRestoreReceipt(
  incomingSubscriptionId: string,
  snapshot: CollectionSnapshot,
  invoice: CollectionSnapshot['invoices'][number],
): { key: string; value: string } {
  const key = `agi_restore_${createHash('sha256').update(incomingSubscriptionId).digest('hex').slice(0, 28)}`;
  const value = JSON.stringify({
    operation: incomingSubscriptionId,
    kept: snapshot.kept,
    customer: snapshot.customer,
    invoice: invoice.id,
    subscription: invoice.subscription,
  });
  if (value.length > STRIPE_METADATA_VALUE_LIMIT) {
    throw new Error('Invoice collection receipt exceeds the settlement limit');
  }
  return { key, value };
}

function hasCollectionRestoreReceipt(
  invoice: Stripe.Invoice,
  receipt: { key: string; value: string },
): boolean {
  const stored = invoice.metadata?.[receipt.key];
  if (stored !== undefined) {
    if (stored !== receipt.value) {
      throw new Error('Invoice collection receipt does not match its settlement');
    }
    return true;
  }
  if (Object.keys(invoice.metadata ?? {}).length >= STRIPE_METADATA_KEY_LIMIT) {
    throw new Error('Invoice collection receipt has no metadata capacity');
  }
  return false;
}

async function captureCollectionSnapshot(
  stripe: Stripe,
  incoming: Stripe.Subscription,
  kept: Stripe.Subscription,
): Promise<CollectionSnapshot> {
  const customer = stripeReference(incoming.customer);
  if (!customer || customer !== stripeReference(kept.customer))
    throw new Error('Duplicate and kept subscriptions have different customers');
  const invoices = await stripe.invoices.list({
    customer,
    status: 'open',
    limit: STRIPE_PAGE_SIZE,
  });
  if (invoices.has_more) throw new Error('Kept invoices exceed the settlement limit');
  if (
    invoices.data.some(
      (invoice) =>
        stripeReference(invoice.customer) !== customer ||
        (stripeReference(invoice.parent?.subscription_details?.subscription) !== null &&
          !isStripeSubscriptionId(
            stripeReference(invoice.parent?.subscription_details?.subscription),
          )),
    )
  ) {
    throw new Error('Kept invoice does not belong to the tracked subscription and customer');
  }
  const snapshot: CollectionSnapshot = {
    kept: kept.id,
    customer,
    invoices: invoices.data
      .filter(
        (invoice) =>
          invoice.auto_advance === true &&
          stripeReference(invoice.parent?.subscription_details?.subscription) !== incoming.id &&
          invoice.id !== stripeReference(incoming.latest_invoice),
      )
      .map((invoice) => ({
        id: invoice.id,
        subscription: stripeReference(invoice.parent?.subscription_details?.subscription),
      })),
    refunds: 0,
    complete: false,
  };
  if (JSON.stringify(snapshot).length > STRIPE_METADATA_VALUE_LIMIT) {
    throw new Error('Kept invoice collection state exceeds the settlement limit');
  }
  for (const recorded of snapshot.invoices) {
    const invoice = invoices.data.find((candidate) => candidate.id === recorded.id);
    if (!invoice) throw new Error('Collection snapshot invoice is missing');
    hasCollectionRestoreReceipt(invoice, collectionRestoreReceipt(incoming.id, snapshot, recorded));
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
  if (snapshot.customer !== stripeReference(incoming.customer))
    throw new Error('Collection snapshot belongs to a different customer');
  const live = new Map<string, boolean>();
  for (const recorded of snapshot.invoices) {
    if (recorded.subscription === incoming.id)
      throw new Error('Collection snapshot includes the duplicate subscription');
    const invoice = await stripe.invoices.retrieve(recorded.id);
    if (
      stripeReference(invoice.customer) !== snapshot.customer ||
      stripeReference(invoice.parent?.subscription_details?.subscription) !== recorded.subscription
    ) {
      throw new Error('Invoice does not belong to its recorded customer and subscription');
    }
    const receipt = collectionRestoreReceipt(incoming.id, snapshot, recorded);
    if (hasCollectionRestoreReceipt(invoice, receipt)) continue;
    if (recorded.subscription !== null && !live.has(recorded.subscription)) {
      const subscription = await stripe.subscriptions.retrieve(recorded.subscription);
      if (stripeReference(subscription.customer) !== snapshot.customer)
        throw new Error('Invoice subscription belongs to a different customer');
      live.set(
        recorded.subscription,
        subscription.status === 'active' ||
          subscription.status === 'trialing' ||
          subscription.status === 'past_due',
      );
    }
    if (recorded.subscription !== null && live.get(recorded.subscription) !== true) continue;
    if (invoice.status === 'open') {
      await stripe.invoices.update(
        invoice.id,
        { auto_advance: true, metadata: { [receipt.key]: receipt.value } },
        { idempotencyKey: `duplicate-subscription-collection:${incoming.id}:${invoice.id}` },
      );
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

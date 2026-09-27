import 'server-only';

import type Stripe from 'stripe';
import type {
  BillingRefund,
  RefundStatus,
  TopUpReceipt,
  TopUpReceiptStatus,
} from '../lib/billing-account-types';

const TOP_UP_PAYMENT_TYPE = 'credit_topup';
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
  return paymentIntent.metadata?.['type'] === TOP_UP_PAYMENT_TYPE;
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

import 'server-only';

import type Stripe from 'stripe';

const UNRECOVERABLE_MANDATE_CODES: ReadonlySet<string> = new Set([
  'payment_intent_mandate_invalid',
  'india_recurring_payment_mandate_canceled',
]);

export interface PreDebitWindow {
  approvalRequested: boolean;
  completesAt: number | null;
}

export function readPreDebitWindow(paymentIntent: Stripe.PaymentIntent): PreDebitWindow | null {
  const notification = paymentIntent.processing?.card?.customer_notification;
  if (!notification) return null;
  return {
    approvalRequested: notification.approval_requested === true,
    completesAt: notification.completes_at ?? null,
  };
}

export function readUnrecoverableMandateCode(
  error: Stripe.PaymentIntent.LastPaymentError | null | undefined,
): string | null {
  for (const candidate of [error?.code, error?.decline_code]) {
    if (candidate && UNRECOVERABLE_MANDATE_CODES.has(candidate)) return candidate;
  }
  return null;
}

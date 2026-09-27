import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { normalizeStripePaymentIntent } from '@/lib/server/payments/stripe-provider';
import {
  failAutoReloadPayment,
  isAutoReloadPaymentIntent,
  settleAutoReloadPayment,
} from '@/lib/services/auto-reload-service';
import type { Stripe } from '@/lib/stripe-types';

const FAILED_PAYMENT_EVENTS: ReadonlySet<string> = new Set([
  'payment_intent.payment_failed',
  'payment_intent.requires_action',
  'payment_intent.canceled',
]);

export async function handleAutoReloadEvent(
  db: DatabaseAdapter,
  event: Stripe.Event,
): Promise<boolean> {
  if (!event.type.startsWith('payment_intent.')) return false;
  const payment = normalizeStripePaymentIntent(event.data.object as Stripe.PaymentIntent);
  if (!isAutoReloadPaymentIntent(payment)) return false;

  if (event.type === 'payment_intent.succeeded') {
    await settleAutoReloadPayment(db, payment);
  } else if (FAILED_PAYMENT_EVENTS.has(event.type)) {
    await failAutoReloadPayment(db, payment);
  }
  return true;
}

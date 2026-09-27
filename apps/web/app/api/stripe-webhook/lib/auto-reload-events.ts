import 'server-only';

import type Stripe from 'stripe';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  failAutoReloadPayment,
  isAutoReloadPaymentIntent,
  settleAutoReloadPayment,
} from '@/lib/services/auto-reload-service';

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
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (!isAutoReloadPaymentIntent(paymentIntent)) return false;

  if (event.type === 'payment_intent.succeeded') {
    await settleAutoReloadPayment(db, paymentIntent);
  } else if (FAILED_PAYMENT_EVENTS.has(event.type)) {
    await failAutoReloadPayment(db, paymentIntent);
  }
  return true;
}

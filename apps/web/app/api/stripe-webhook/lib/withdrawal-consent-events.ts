import 'server-only';

import {
  WITHDRAWAL_CONSENT_AT_KEY,
  WITHDRAWAL_CONSENT_VERSION_KEY,
} from '@/lib/billing/withdrawal-consent';
import { logger } from '@/lib/logger';
import type { Stripe } from '@/lib/stripe-types';
import { stripeIdOf } from './stripe-ref';

export async function recordWithdrawalConsent(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  acceptedAtSeconds: number,
): Promise<void> {
  const version = session.metadata?.[WITHDRAWAL_CONSENT_VERSION_KEY];
  if (session.consent?.terms_of_service !== 'accepted' || !version) return;

  const metadata = {
    [WITHDRAWAL_CONSENT_VERSION_KEY]: version,
    [WITHDRAWAL_CONSENT_AT_KEY]: new Date(acceptedAtSeconds * 1000).toISOString(),
  };
  const subscriptionId = stripeIdOf(session.subscription);
  const paymentIntentId = stripeIdOf(session.payment_intent);
  try {
    if (session.mode === 'subscription' && subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, { metadata });
    } else if (session.mode === 'payment' && paymentIntentId) {
      await stripe.paymentIntents.update(paymentIntentId, { metadata });
    }
  } catch (error) {
    logger.error(
      { error, sessionId: session.id, subscriptionId, paymentIntentId },
      'Consent to immediate access could not be recorded; a 14-day withdrawal from this purchase is refunded in full',
    );
  }
}

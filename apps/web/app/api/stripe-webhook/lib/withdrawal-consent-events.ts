import 'server-only';

import {
  WITHDRAWAL_CONSENT_AT_KEY,
  WITHDRAWAL_CONSENT_VERSION_KEY,
} from '@/lib/billing/withdrawal-consent';
import { logger } from '@/lib/logger';
import type { Stripe } from '@/lib/stripe-types';

function referenceOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

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
  const subscriptionId = referenceOf(session.subscription);
  const paymentIntentId = referenceOf(session.payment_intent);
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

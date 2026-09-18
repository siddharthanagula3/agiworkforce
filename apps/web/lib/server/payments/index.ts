import 'server-only';

import { resolveSubscriptionBillingSource } from '@/lib/server/subscription-billing-owner';

import { applePaymentProvider } from './apple-provider';
import { googlePaymentProvider } from './google-provider';
import { stripePaymentProvider } from './stripe-provider';
import {
  isPaymentProviderId,
  pollsSubscriptionState,
  type PaymentProvider,
  type PaymentProviderId,
} from './domain';

export const PAYMENT_PROVIDERS: Readonly<Record<PaymentProviderId, PaymentProvider>> = {
  stripe: stripePaymentProvider,
  apple: applePaymentProvider,
  google: googlePaymentProvider,
};

export function getPaymentProvider(id: PaymentProviderId): PaymentProvider {
  return PAYMENT_PROVIDERS[id];
}

interface SubscriptionOwnerRow {
  plan_tier: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  apple_original_transaction_id?: string | null;
  google_purchase_token?: string | null;
}

/**
 * The provider that owns a stored subscription row, derived from the same
 * ownership rules the billing surfaces use, so a row with contradictory
 * identifiers resolves to no provider instead of the first one that matched.
 */
export function resolvePaymentProviderForSubscription(
  subscription: SubscriptionOwnerRow | null | undefined,
): PaymentProvider | null {
  const source = resolveSubscriptionBillingSource(subscription);
  return isPaymentProviderId(source) ? PAYMENT_PROVIDERS[source] : null;
}

export { applePaymentProvider, googlePaymentProvider, stripePaymentProvider };
export { isPaymentProviderId, pollsSubscriptionState };
export { PAYMENT_PROVIDER_IDS } from './domain';
export type {
  NormalizedEnvironment,
  NormalizedInterval,
  NormalizedMoney,
  NormalizedPeriod,
  NormalizedPlanReference,
  NormalizedPurchase,
  NormalizedPurchaseState,
  NormalizedSubscription,
  NormalizedSubscriptionStatus,
  PaymentProvider,
  PaymentProviderCapabilities,
  PaymentProviderId,
  PollablePaymentProvider,
  PurchaseVerificationInput,
} from './domain';

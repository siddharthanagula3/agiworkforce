import 'server-only';

import { logger } from '@/lib/logger';

import type {
  NormalizedPurchase,
  NormalizedSubscription,
  PaymentProvider,
  PurchaseVerificationInput,
} from './domain';
import {
  normalizeEnvironment,
  normalizeProviderPeriod,
  normalizeProviderQuantity,
  normalizeSubscriptionStatus,
} from './normalize';
import { verifyStorePurchase } from './store-purchase';

const PROVIDER_ID = 'google' as const;
const CANCELLED_SUBSCRIPTION_STATE = 'SUBSCRIPTION_STATE_CANCELED';

export const googlePaymentProvider: PaymentProvider = {
  id: PROVIDER_ID,
  capabilities: { pollsSubscriptionState: false, hostedBillingPortal: true },

  verifyPurchase(input: PurchaseVerificationInput): Promise<NormalizedPurchase> {
    return verifyStorePurchase(PROVIDER_ID, 'android', input);
  },
};

export interface GoogleSubscriptionNotice {
  purchaseToken: string;
  productId: string | null;
  subscriptionState: string | null;
  startTime: string | null;
  expiryTime: string | null;
  obfuscatedExternalAccountId: string | null;
  testPurchase: boolean;
}

/**
 * Real-time developer notifications name a purchase token and a state; the
 * times arrive as RFC 3339 strings rather than the epoch seconds Stripe sends,
 * which is exactly the difference `./normalize` exists to absorb.
 */
export function normalizeGoogleSubscriptionNotice(
  notice: GoogleSubscriptionNotice,
): NormalizedSubscription {
  const { status, mapped } = normalizeSubscriptionStatus(PROVIDER_ID, notice.subscriptionState);
  if (!mapped) {
    logger.error(
      { subscriptionState: notice.subscriptionState },
      'Unknown Google Play subscription state; normalized to unpaid so no unearned entitlement is granted',
    );
  }

  return {
    provider: PROVIDER_ID,
    subscriptionReference: notice.purchaseToken,
    customerReference: notice.obfuscatedExternalAccountId,
    ownerReference: notice.obfuscatedExternalAccountId,
    plan: { productReference: notice.productId, priceReference: null },
    status,
    period: normalizeProviderPeriod(notice.startTime, notice.expiryTime, 'milliseconds'),
    interval: null,
    quantity: normalizeProviderQuantity(1),
    cancelAtPeriodEnd: notice.subscriptionState === CANCELLED_SUBSCRIPTION_STATE,
    endedAt: null,
    environment: normalizeEnvironment(notice.testPurchase ? 'sandbox' : 'production'),
  };
}

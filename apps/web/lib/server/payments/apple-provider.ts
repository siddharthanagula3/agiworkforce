import 'server-only';

import { logger } from '@/lib/logger';
import {
  verifyAppleStoreNotification,
  type VerifiedAppleStoreNotification,
} from '@/lib/server/mobile-iap-store-verification';

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
  normalizeProviderTimestamp,
  normalizeSubscriptionStatus,
} from './normalize';
import { verifyStorePurchase } from './store-purchase';

const PROVIDER_ID = 'apple' as const;

export const applePaymentProvider: PaymentProvider = {
  id: PROVIDER_ID,
  capabilities: { pollsSubscriptionState: false, hostedBillingPortal: true },

  verifyPurchase(input: PurchaseVerificationInput): Promise<NormalizedPurchase> {
    return verifyStorePurchase(PROVIDER_ID, 'ios', input);
  },
};

/**
 * App Store Server Notifications V2 carry the subscription state Apple will not
 * answer a poll for. The signed payload is verified by
 * `verifyAppleStoreNotification` against the environment this deployment trusts;
 * everything after that is normalization, in Apple's own units (epoch millis).
 */
export function normalizeAppleStoreNotification(
  verified: VerifiedAppleStoreNotification,
): NormalizedSubscription | null {
  const transaction = verified.transaction;
  if (!transaction?.originalTransactionId) return null;

  const { status, mapped } = normalizeSubscriptionStatus(
    PROVIDER_ID,
    verified.notification.data?.status,
  );
  if (!mapped) {
    logger.error(
      {
        notificationType: verified.notification.notificationType,
        status: verified.notification.data?.status,
      },
      'Unknown App Store subscription status; normalized to unpaid so no unearned entitlement is granted',
    );
  }

  return {
    provider: PROVIDER_ID,
    subscriptionReference: transaction.originalTransactionId,
    customerReference: transaction.appAccountToken ?? null,
    ownerReference: transaction.appAccountToken ?? null,
    plan: { productReference: transaction.productId ?? null, priceReference: null },
    status,
    period: normalizeProviderPeriod(
      transaction.purchaseDate,
      transaction.expiresDate,
      'milliseconds',
    ),
    interval: null,
    quantity: normalizeProviderQuantity(transaction.quantity),
    cancelAtPeriodEnd: verified.notification.subtype === 'AUTO_RENEW_DISABLED',
    endedAt: normalizeProviderTimestamp(transaction.revocationDate, 'milliseconds'),
    environment: normalizeEnvironment(transaction.environment),
  };
}

export async function readAppleSubscriptionFromNotification(
  signedPayload: string,
): Promise<NormalizedSubscription | null> {
  return normalizeAppleStoreNotification(await verifyAppleStoreNotification(signedPayload));
}

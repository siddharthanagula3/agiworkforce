import 'server-only';

import type { MobileIapPlatform } from '@agiworkforce/types';

import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import {
  verifyMobileIapPurchase,
  type VerifiedMobileIapPurchase,
} from '@/lib/server/mobile-iap-store-verification';

import type {
  NormalizedPurchase,
  NormalizedPurchaseState,
  PaymentProviderId,
  PurchaseVerificationInput,
} from './domain';
import {
  normalizeEnvironment,
  normalizeProviderQuantity,
  normalizeProviderTimestamp,
} from './normalize';

const PURCHASE_STATE_BY_ENTITLEMENT: Readonly<
  Record<VerifiedMobileIapPurchase['entitlementStatus'], NormalizedPurchaseState>
> = {
  active: 'paid',
  expired: 'expired',
  revoked: 'revoked',
};

export function normalizeStorePurchase(
  provider: PaymentProviderId,
  verified: VerifiedMobileIapPurchase,
  ownerReference: string | null,
): NormalizedPurchase {
  return {
    provider,
    purchaseReference: verified.storeTransactionId,
    ownerReference,
    plan: { productReference: verified.product.productId, priceReference: null },
    planTier: verified.product.kind === 'subscription' ? verified.product.planTier : null,
    state: PURCHASE_STATE_BY_ENTITLEMENT[verified.entitlementStatus],
    purchasedAt: normalizeProviderTimestamp(verified.purchasedAt),
    expiresAt: normalizeProviderTimestamp(verified.expiresAt),
    quantity: normalizeProviderQuantity(1),
    amount: null,
    environment: normalizeEnvironment(verified.environment),
  };
}

export async function verifyStorePurchase(
  provider: PaymentProviderId,
  platform: MobileIapPlatform,
  input: PurchaseVerificationInput,
): Promise<NormalizedPurchase> {
  const ownerReference = input.ownerReference?.trim();
  if (!ownerReference) {
    throw new Error('A store purchase must name the account it belongs to.');
  }
  const productReference = input.productReference?.trim();
  if (!productReference) {
    throw new Error('A store purchase must name the product it was made against.');
  }
  const product = resolveMobileIapProduct(platform, productReference);
  if (!product) {
    throw new Error('This store product is not in the mobile in-app purchase catalog.');
  }

  const verified = await verifyMobileIapPurchase({
    platform,
    product,
    purchaseToken: input.reference,
    appAccountToken: ownerReference,
  });
  return normalizeStorePurchase(provider, verified, ownerReference);
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import { resolveAppleLifecycle } from '@/lib/server/mobile-iap-lifecycle';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  applePurchaseFromNotification,
  hashMobileIapPurchaseToken,
  verifyAppleStoreNotification,
} from '@/lib/server/mobile-iap-store-verification';
import {
  grantMobileIapPurchaseFromStore,
  hasMobileIapReceipt,
  processMobileIapLifecycleEvent,
  recordUnattributedStoreCharge,
} from '@/lib/services/mobile-iap-notification-service';

const AUTO_RENEW_OFF = 0;
const REVOCATION_PERCENTAGE_WHOLE = 100_000;
const ENDPOINT = '/api/mobile/iap/apple-notifications';

const BodySchema = z.object({ signedPayload: z.string().min(20).max(64_000) }).strict();

async function handleAppleNotification(request: NextRequest): Promise<NextResponse> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('Invalid App Store notification.');

  const verified = await verifyAppleStoreNotification(parsed.data.signedPayload);
  const notificationId = verified.notification.notificationUUID;
  if (!notificationId) throw createError.badRequest('App Store notification has no identifier.');

  const transaction = verified.transaction;
  const signedTransaction = verified.notification.data?.signedTransactionInfo;
  if (!transaction || !signedTransaction) {
    return NextResponse.json({ received: true, status: 'no_transaction' });
  }
  if (!transaction.productId || !transaction.transactionId || !transaction.purchaseDate) {
    throw createError.badRequest('App Store notification transaction is incomplete.');
  }
  const product = resolveMobileIapProduct('ios', transaction.productId);
  if (!product)
    throw createError.badRequest('App Store notification references an unknown product.');

  const notificationType = String(verified.notification.notificationType ?? 'UNKNOWN');
  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const renewalInfo = verified.renewalInfo ?? null;
  const lifecycle = resolveAppleLifecycle({
    kind: product.kind,
    notificationType,
    subtype: verified.notification.subtype ? String(verified.notification.subtype) : null,
    expiresAt,
    gracePeriodExpiresAt: renewalInfo?.gracePeriodExpiresDate
      ? new Date(renewalInfo.gracePeriodExpiresDate)
      : null,
    autoRenewEnabled:
      typeof renewalInfo?.autoRenewStatus === 'number'
        ? renewalInfo.autoRenewStatus !== AUTO_RENEW_OFF
        : null,
    now: new Date(),
  });
  const originalTransactionId = transaction.originalTransactionId ?? transaction.transactionId;
  const purchase =
    lifecycle?.state === 'active' ? applePurchaseFromNotification({ verified, product }) : null;
  const charged = purchase !== null && purchase.environment !== 'sandbox';
  const appAccountToken = transaction.appAccountToken;
  if (!appAccountToken) {
    if (!charged) {
      throw createError.badRequest('App Store notification transaction is incomplete.');
    }
    await recordUnattributedStoreCharge({
      platform: 'ios',
      reason: 'no_account_token',
      storeTransactionId: transaction.transactionId,
      originalTransactionId,
      productId: transaction.productId,
      endpoint: ENDPOINT,
    });
    return NextResponse.json({ received: true, status: 'unattributed' });
  }
  if (!lifecycle) {
    return NextResponse.json({ received: true, status: 'ignored' });
  }

  const db = getNeonDb();
  const purchaseTokenHash = hashMobileIapPurchaseToken(signedTransaction);
  if (purchase) {
    const known = await hasMobileIapReceipt(db, {
      platform: 'ios',
      storeTransactionId: transaction.transactionId,
      purchaseTokenHash,
      originalTransactionId,
    });
    if (!known) {
      const grant = await grantMobileIapPurchaseFromStore({
        db,
        appAccountToken,
        purchaseToken: signedTransaction,
        verified: purchase,
      });
      if (charged && (grant === 'unknown_account' || grant === 'not_grantable')) {
        await recordUnattributedStoreCharge({
          platform: 'ios',
          reason: grant,
          storeTransactionId: transaction.transactionId,
          originalTransactionId,
          productId: transaction.productId,
          endpoint: ENDPOINT,
        });
      }
    }
  }

  const result = await processMobileIapLifecycleEvent({
    db,
    event: {
      platform: 'ios',
      notificationId,
      eventType: notificationType,
      product,
      storeTransactionId: transaction.transactionId,
      purchaseTokenHash,
      originalTransactionId,
      appAccountToken,
      purchasedAt: new Date(transaction.purchaseDate),
      expiresAt,
      entitlementStatus: lifecycle.state,
      cancelAtPeriodEnd: lifecycle.cancelAtPeriodEnd,
      accessUntil: lifecycle.accessUntil,
      environment: verified.channel === 'sandbox' ? 'sandbox' : 'production',
      signedAt:
        typeof verified.notification.signedDate === 'number'
          ? new Date(verified.notification.signedDate)
          : null,
      ...(typeof transaction.revocationPercentage === 'number'
        ? { refundFraction: transaction.revocationPercentage / REVOCATION_PERCENTAGE_WHOLE }
        : {}),
    },
  });
  return NextResponse.json({ received: true, status: result });
}

export const POST = withErrorHandler(handleAppleNotification);
export const runtime = 'nodejs';

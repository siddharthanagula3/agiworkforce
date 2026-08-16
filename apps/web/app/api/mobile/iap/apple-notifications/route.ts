import { NextRequest, NextResponse } from 'next/server';
import { NotificationTypeV2, Subtype } from '@apple/app-store-server-library';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  hashMobileIapPurchaseToken,
  verifyAppleStoreNotification,
} from '@/lib/server/mobile-iap-store-verification';
import { processMobileIapLifecycleEvent } from '@/lib/services/mobile-iap-notification-service';

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
  if (
    !transaction.productId ||
    !transaction.transactionId ||
    !transaction.purchaseDate ||
    !transaction.appAccountToken
  ) {
    throw createError.badRequest('App Store notification transaction is incomplete.');
  }
  const product = resolveMobileIapProduct('ios', transaction.productId);
  if (!product)
    throw createError.badRequest('App Store notification references an unknown product.');

  const notificationType = String(verified.notification.notificationType ?? 'UNKNOWN');
  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const refunded = notificationType === NotificationTypeV2.REFUND;
  const restored = notificationType === NotificationTypeV2.REFUND_REVERSED;
  const revoked = notificationType === NotificationTypeV2.REVOKE;
  const expired = [NotificationTypeV2.EXPIRED, NotificationTypeV2.GRACE_PERIOD_EXPIRED].includes(
    notificationType as NotificationTypeV2,
  );
  const transactionExpired = expiresAt !== null && expiresAt.getTime() <= Date.now();
  const result = await processMobileIapLifecycleEvent({
    db: getNeonDb(),
    event: {
      platform: 'ios',
      notificationId,
      eventType: notificationType,
      product,
      storeTransactionId: transaction.transactionId,
      purchaseTokenHash: hashMobileIapPurchaseToken(signedTransaction),
      originalTransactionId: transaction.originalTransactionId ?? transaction.transactionId,
      appAccountToken: transaction.appAccountToken,
      purchasedAt: new Date(transaction.purchaseDate),
      expiresAt,
      entitlementStatus: refunded
        ? 'refunded'
        : restored && product.kind === 'top_up'
          ? 'restored'
          : revoked
            ? 'revoked'
            : expired || transactionExpired
              ? 'expired'
              : 'active',
      cancelAtPeriodEnd: verified.notification.subtype === Subtype.AUTO_RENEW_DISABLED,
      ...(typeof transaction.revocationPercentage === 'number'
        ? { refundFraction: transaction.revocationPercentage / 100_000 }
        : {}),
    },
  });
  return NextResponse.json({ received: true, status: result });
}

export const POST = withErrorHandler(handleAppleNotification);
export const runtime = 'nodejs';

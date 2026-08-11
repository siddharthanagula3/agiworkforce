import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  hashMobileIapPurchaseToken,
  verifyGooglePlayLifecyclePurchase,
} from '@/lib/server/mobile-iap-store-verification';
import { processMobileIapLifecycleEvent } from '@/lib/services/mobile-iap-notification-service';

const PubSubEnvelopeSchema = z
  .object({
    message: z.object({
      data: z.string().min(1).max(64_000),
      messageId: z.string().min(1).max(200),
    }),
    subscription: z.string().optional(),
  })
  .strict();

const DeveloperNotificationSchema = z
  .object({
    packageName: z.string().min(1),
    subscriptionNotification: z
      .object({ notificationType: z.number().int(), purchaseToken: z.string().min(20) })
      .optional(),
    oneTimeProductNotification: z
      .object({
        notificationType: z.number().int(),
        purchaseToken: z.string().min(20),
        sku: z.string().min(1),
      })
      .optional(),
    testNotification: z.unknown().optional(),
  })
  .passthrough();

async function requireGooglePubSubIdentity(request: NextRequest): Promise<void> {
  const audience = process.env['GOOGLE_PLAY_PUBSUB_AUDIENCE']?.trim();
  const expectedEmail = process.env['GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL']?.trim();
  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!audience || !expectedEmail) {
    throw createError.serviceUnavailable('Google Play notifications are not configured.');
  }
  if (!token) throw createError.unauthorized('Google Pub/Sub identity is required.');

  let payload;
  try {
    const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
    payload = ticket.getPayload();
  } catch {
    throw createError.unauthorized('Google Pub/Sub identity could not be verified.');
  }
  if (payload?.email !== expectedEmail || payload.email_verified !== true) {
    throw createError.forbidden('Google Pub/Sub identity is not authorized.');
  }
}

async function handleGoogleNotification(request: NextRequest): Promise<NextResponse> {
  await requireGooglePubSubIdentity(request);
  const envelope = PubSubEnvelopeSchema.safeParse(await request.json().catch(() => null));
  if (!envelope.success) throw createError.badRequest('Invalid Google Pub/Sub envelope.');

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(envelope.data.message.data, 'base64').toString('utf8'));
  } catch {
    throw createError.badRequest('Invalid Google Play notification data.');
  }
  const notification = DeveloperNotificationSchema.safeParse(decoded);
  if (!notification.success) throw createError.badRequest('Invalid Google Play notification.');
  const expectedPackage = process.env['GOOGLE_PLAY_PACKAGE_NAME']?.trim();
  if (!expectedPackage || notification.data.packageName !== expectedPackage) {
    throw createError.forbidden('Google Play notification package does not match.');
  }
  if (notification.data.testNotification) {
    return NextResponse.json({ received: true, status: 'test' });
  }

  const storeNotification =
    notification.data.subscriptionNotification ?? notification.data.oneTimeProductNotification;
  if (!storeNotification) {
    return NextResponse.json({ received: true, status: 'no_purchase' });
  }
  const purchaseTokenHash = hashMobileIapPurchaseToken(storeNotification.purchaseToken);
  const db = getNeonDb();
  const [anchor] = await db.query<{
    product_id: string;
    app_account_token: string;
  }>(
    `select receipt.product_id, account.app_account_token
       from public.mobile_iap_transactions receipt
       join public.mobile_iap_accounts account on account.user_id = receipt.user_id
      where receipt.platform = 'android'
        and receipt.purchase_token_hash = $1
      limit 1`,
    [purchaseTokenHash],
  );
  if (!anchor) {
    // A device verification can race the RTDN delivery. Acknowledge the
    // unknown event; the device path remains the only safe account binder.
    return NextResponse.json({ received: true, status: 'unknown_purchase' });
  }
  const productId = notification.data.oneTimeProductNotification?.sku ?? anchor.product_id;
  const product = resolveMobileIapProduct('android', productId);
  if (!product)
    throw createError.badRequest('Google Play notification references an unknown product.');
  const verified = await verifyGooglePlayLifecyclePurchase({
    product,
    purchaseToken: storeNotification.purchaseToken,
    appAccountToken: anchor.app_account_token,
  });
  const oneTimeCanceled = notification.data.oneTimeProductNotification?.notificationType === 2;
  const subscriptionType = notification.data.subscriptionNotification?.notificationType;
  const result = await processMobileIapLifecycleEvent({
    db,
    event: {
      platform: 'android',
      notificationId: envelope.data.message.messageId,
      eventType: `google:${subscriptionType ?? notification.data.oneTimeProductNotification?.notificationType ?? 'unknown'}`,
      product,
      storeTransactionId: verified.storeTransactionId,
      purchaseTokenHash,
      originalTransactionId: verified.originalTransactionId,
      appAccountToken: anchor.app_account_token,
      purchasedAt: verified.purchasedAt,
      expiresAt: verified.expiresAt,
      entitlementStatus: oneTimeCanceled ? 'refunded' : verified.entitlementStatus,
      cancelAtPeriodEnd: subscriptionType === 3,
      rawGooglePurchaseToken: storeNotification.purchaseToken,
    },
  });
  return NextResponse.json({ received: true, status: result });
}

export const POST = withErrorHandler(handleGoogleNotification);
export const runtime = 'nodejs';

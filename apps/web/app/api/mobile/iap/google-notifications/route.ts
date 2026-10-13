import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { MobileIapCatalogProduct } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import {
  GOOGLE_SUBSCRIPTION_REVOKED_NOTIFICATION,
  grantsAccess,
  type MobileIapEntitlementState,
} from '@/lib/server/mobile-iap-lifecycle';
import { getNeonDb } from '@/lib/server/neon-db';
import { verifyGooglePubSubPushIdentity } from '@/lib/server/google-pubsub-push-identity';
import {
  acknowledgeGooglePlayPurchase,
  hashMobileIapPurchaseToken,
  readGooglePlayPurchaseOwner,
  verifyGooglePlayLifecyclePurchase,
} from '@/lib/server/mobile-iap-store-verification';
import {
  grantMobileIapPurchaseFromStore,
  processMobileIapLifecycleEvent,
  recordUnattributedStoreCharge,
} from '@/lib/services/mobile-iap-notification-service';

const ONE_TIME_PRODUCT_CANCELED = 2;
const VOIDED_PRODUCT_TYPE_SUBSCRIPTION = 1;
const ENDPOINT = '/api/mobile/iap/google-notifications';

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
    eventTimeMillis: z.coerce.number().int().positive().optional(),
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
    voidedPurchaseNotification: z
      .object({
        purchaseToken: z.string().min(20),
        orderId: z.string().min(1),
        productType: z.number().int(),
        refundType: z.number().int().optional(),
      })
      .optional(),
    testNotification: z.unknown().optional(),
  })
  .passthrough();

interface PurchaseBinding {
  product: MobileIapCatalogProduct;
  appAccountToken: string;
  recorded: boolean;
}

/** A purchase no account can be found for, and the paid order behind it if any. */
interface UnboundPurchase {
  unbound: true;
  chargedOrderId: string | null;
  productId: string | null;
}

async function readRecordedBinding(
  db: DatabaseAdapter,
  purchaseTokenHash: string,
): Promise<{ product_id: string; app_account_token: string } | undefined> {
  const [anchor] = await db.query<{ product_id: string; app_account_token: string }>(
    `select receipt.product_id, account.app_account_token
       from public.mobile_iap_transactions receipt
       join public.mobile_iap_accounts account on account.user_id = receipt.user_id
      where receipt.platform = 'android'
        and receipt.purchase_token_hash = $1
      limit 1`,
    [purchaseTokenHash],
  );
  return anchor;
}

// A token this ledger has never seen is still a real purchase: a plan change
// issues a new one, and a payment approved while the app was closed reaches the
// server before the app does. Play names the account it was bought for.
async function resolvePurchaseBinding(input: {
  db: DatabaseAdapter;
  kind: 'subscription' | 'top_up';
  purchaseToken: string;
  purchaseTokenHash: string;
  sku: string | undefined;
  voided: boolean;
}): Promise<PurchaseBinding | UnboundPurchase> {
  const recorded = await readRecordedBinding(input.db, input.purchaseTokenHash);
  if (recorded) {
    const product = resolveMobileIapProduct('android', input.sku ?? recorded.product_id);
    if (!product)
      throw createError.badRequest('Google Play notification references an unknown product.');
    return { product, appAccountToken: recorded.app_account_token, recorded: true };
  }
  if (input.voided) return { unbound: true, chargedOrderId: null, productId: null };

  const owner = await readGooglePlayPurchaseOwner({
    kind: input.kind,
    purchaseToken: input.purchaseToken,
    ...(input.sku ? { productId: input.sku } : {}),
  });
  if (!owner.appAccountToken || !owner.productId) {
    return {
      unbound: true,
      chargedOrderId: owner.chargedOrderId,
      productId: owner.productId ?? input.sku ?? null,
    };
  }
  const product = resolveMobileIapProduct('android', owner.productId);
  if (!product)
    throw createError.badRequest('Google Play notification references an unknown product.');
  return { product, appAccountToken: owner.appAccountToken, recorded: false };
}

async function requireGooglePubSubIdentity(request: NextRequest): Promise<void> {
  const identity = await verifyGooglePubSubPushIdentity(request.headers.get('authorization'), {
    audience: process.env['GOOGLE_PLAY_PUBSUB_AUDIENCE'],
    serviceAccountEmail: process.env['GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL'],
  });
  if (identity.ok) return;
  if (identity.reason === 'not_configured') {
    throw createError.serviceUnavailable('Google Play notifications are not configured.');
  }
  if (identity.reason === 'not_authorized') {
    throw createError.forbidden('Google Pub/Sub identity is not authorized.');
  }
  throw createError.unauthorized('Google Pub/Sub identity could not be verified.');
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

  const { subscriptionNotification, oneTimeProductNotification, voidedPurchaseNotification } =
    notification.data;
  const storeNotification =
    subscriptionNotification ?? oneTimeProductNotification ?? voidedPurchaseNotification;
  if (!storeNotification) {
    return NextResponse.json({ received: true, status: 'no_purchase' });
  }
  const voided = !subscriptionNotification && !oneTimeProductNotification;
  const sellsSubscription =
    subscriptionNotification !== undefined ||
    (voided && voidedPurchaseNotification?.productType === VOIDED_PRODUCT_TYPE_SUBSCRIPTION);
  const purchaseToken = storeNotification.purchaseToken;
  const purchaseTokenHash = hashMobileIapPurchaseToken(purchaseToken);
  const db = getNeonDb();
  const binding = await resolvePurchaseBinding({
    db,
    kind: sellsSubscription ? 'subscription' : 'top_up',
    purchaseToken,
    purchaseTokenHash,
    sku: oneTimeProductNotification?.sku,
    voided,
  });
  if ('unbound' in binding) {
    if (binding.chargedOrderId === null) {
      return NextResponse.json({ received: true, status: 'unknown_purchase' });
    }
    await recordUnattributedStoreCharge({
      platform: 'android',
      reason: 'no_account_token',
      storeTransactionId: binding.chargedOrderId,
      productId: binding.productId,
      endpoint: ENDPOINT,
    });
    return NextResponse.json({ received: true, status: 'unattributed' });
  }

  const subscriptionType = subscriptionNotification?.notificationType;
  const verified = await verifyGooglePlayLifecyclePurchase({
    product: binding.product,
    purchaseToken,
    appAccountToken: binding.appAccountToken,
    notificationType: voided
      ? GOOGLE_SUBSCRIPTION_REVOKED_NOTIFICATION
      : (subscriptionType ?? null),
  });
  const reported = verified.lifecycle ?? verified.entitlementStatus;
  if (reported === 'pending') {
    return NextResponse.json({ received: true, status: 'pending' });
  }
  const oneTimeReversed =
    oneTimeProductNotification?.notificationType === ONE_TIME_PRODUCT_CANCELED ||
    (voided && !sellsSubscription);
  const state: MobileIapEntitlementState = oneTimeReversed ? 'refunded' : reported;

  let recorded = binding.recorded;
  if (!recorded && grantsAccess(state)) {
    const grant = await grantMobileIapPurchaseFromStore({
      db,
      appAccountToken: binding.appAccountToken,
      purchaseToken,
      verified,
    });
    recorded = grant === 'granted';
    if (
      state === 'active' &&
      verified.environment !== 'sandbox' &&
      (grant === 'unknown_account' || grant === 'not_grantable')
    ) {
      await recordUnattributedStoreCharge({
        platform: 'android',
        reason: grant,
        storeTransactionId: verified.storeTransactionId,
        productId: verified.product.productId,
        endpoint: ENDPOINT,
      });
    }
  }

  const result = await processMobileIapLifecycleEvent({
    db,
    event: {
      platform: 'android',
      notificationId: envelope.data.message.messageId,
      eventType: voided
        ? 'google:voided'
        : `google:${subscriptionType ?? oneTimeProductNotification?.notificationType ?? 'unknown'}`,
      product: verified.product,
      storeTransactionId: verified.storeTransactionId,
      purchaseTokenHash,
      originalTransactionId: verified.originalTransactionId,
      appAccountToken: binding.appAccountToken,
      purchasedAt: verified.purchasedAt,
      expiresAt: verified.expiresAt,
      entitlementStatus: state,
      cancelAtPeriodEnd: verified.cancelAtPeriodEnd ?? false,
      accessUntil: state === 'grace' ? verified.expiresAt : null,
      rawGooglePurchaseToken: purchaseToken,
      environment: verified.environment,
      signedAt:
        notification.data.eventTimeMillis === undefined
          ? null
          : new Date(notification.data.eventTimeMillis),
    },
  });

  // Play refunds a purchase nobody acknowledges within three days. The app
  // acknowledges too, but a buyer who never reopens it would lose a paid plan.
  if (recorded && grantsAccess(state) && verified.storeAcknowledged === false) {
    await acknowledgeGooglePlayPurchase({ product: verified.product, purchaseToken });
  }
  return NextResponse.json({ received: true, status: result });
}

export const POST = withErrorHandler(handleGoogleNotification);
export const runtime = 'nodejs';

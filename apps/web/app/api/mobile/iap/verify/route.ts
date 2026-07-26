/**
 * Mobile In-App-Purchase Receipt Verification
 *
 * POST /api/mobile/iap/verify — verifies a completed StoreKit 2 / Play
 * Billing subscription purchase from the mobile app and upserts it into the
 * SAME `public.subscriptions` table Stripe checkout writes to (see
 * `apps/web/app/api/stripe-webhook/lib/db.ts`), so a mobile-purchased
 * subscription reconciles into the one tier system rather than a parallel
 * one.
 *
 * Client: `apps/mobile/src/features/billing/useIapPurchaseFlow.ts`'s
 * `reportPurchaseToServer` calls this route with the StoreKit/Play Billing
 * purchase before finalizing the transaction with the store — verification
 * must succeed here before the client calls `finishTransaction`, so a
 * failed-verification purchase never silently vanishes from the StoreKit/Play
 * queue with no server record.
 *
 * Auth: Bearer (mirrors `apps/web/app/api/mobile/push-token/route.ts`).
 *
 * Fails CLOSED when Apple/Google server credentials aren't configured
 * (`createError.serviceUnavailable`, 503) rather than silently accepting the
 * purchase — see `lib/server/iap-verify-apple.ts` / `iap-verify-google.ts`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';
import { resolveTierFromProductId } from '@/lib/server/iap-product-catalog';
import { verifyAppleTransaction } from '@/lib/server/iap-verify-apple';
import { verifyGoogleSubscription } from '@/lib/server/iap-verify-google';
import { SubscriptionService } from '@/lib/services/subscription-service';

const VerifyRequestSchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    productId: z.string().min(1).max(200),
    receipt: z.string().min(1).optional(),
    purchaseToken: z.string().min(1).optional(),
  })
  .refine((body) => (body.platform === 'ios' ? !!body.receipt : !!body.purchaseToken), {
    message: 'ios requires `receipt`, android requires `purchaseToken`',
  });

interface VerifiedPurchase {
  planTier: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  appleOriginalTransactionId: string | null;
  googlePurchaseToken: string | null;
}

async function verifyPurchase(
  platform: 'ios' | 'android',
  productId: string,
  receipt: string | undefined,
  purchaseToken: string | undefined,
): Promise<VerifiedPurchase> {
  const resolved = resolveTierFromProductId(productId, platform);
  if (!resolved) {
    throw createError.badRequest(`Unknown product id for ${platform}: ${productId}`);
  }

  if (platform === 'ios') {
    const info = await verifyAppleTransaction(receipt as string, productId);
    const now = Date.now();
    const status = info.revocationDate
      ? 'canceled'
      : info.expiresDate && info.expiresDate > now
        ? 'active'
        : 'past_due';

    return {
      planTier: resolved.tier,
      status,
      currentPeriodStart: new Date(info.purchaseDate),
      currentPeriodEnd: info.expiresDate ? new Date(info.expiresDate) : null,
      cancelAtPeriodEnd: false,
      canceledAt: info.revocationDate ? new Date(info.revocationDate) : null,
      appleOriginalTransactionId: info.originalTransactionId,
      googlePurchaseToken: null,
    };
  }

  const info = await verifyGoogleSubscription(purchaseToken as string, productId);
  const status =
    info.cancelReason !== null ? 'canceled' : info.paymentState === 0 ? 'past_due' : 'active';

  return {
    planTier: resolved.tier,
    status,
    currentPeriodStart: info.startTimeMillis ? new Date(info.startTimeMillis) : null,
    currentPeriodEnd: new Date(info.expiryTimeMillis),
    cancelAtPeriodEnd: !info.autoRenewing,
    canceledAt: null,
    appleOriginalTransactionId: null,
    googlePurchaseToken: purchaseToken as string,
  };
}

async function handleVerify(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'mobile-iap-verify');
  if (rateLimitResponse) return rateLimitResponse;

  // Mobile purchase verification is Bearer-authenticated. Resolve identity
  // from this request before CSRF handling so a valid app token never falls
  // through to cookie-only Clerk auth.
  const userId = await requireCurrentUserId(request);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse;

  const body = await request.json().catch(() => null);
  const parsed = VerifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid IAP verification payload', parsed.error.flatten());
  }
  const { platform, productId, receipt, purchaseToken } = parsed.data;

  const purchase = await verifyPurchase(platform, productId, receipt, purchaseToken);

  const db = getNeonDb();

  const upserted = await db
    .query<{ id: string }>(
      `insert into public.subscriptions (
         user_id, status, plan_tier,
         apple_original_transaction_id, google_purchase_token,
         current_period_start, current_period_end,
         cancel_at_period_end, canceled_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (user_id) do update set
         status = excluded.status,
         plan_tier = excluded.plan_tier,
         apple_original_transaction_id = coalesce(excluded.apple_original_transaction_id, public.subscriptions.apple_original_transaction_id),
         google_purchase_token = coalesce(excluded.google_purchase_token, public.subscriptions.google_purchase_token),
         current_period_start = excluded.current_period_start,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         canceled_at = excluded.canceled_at
       returning id`,
      [
        userId,
        purchase.status,
        purchase.planTier,
        purchase.appleOriginalTransactionId,
        purchase.googlePurchaseToken,
        purchase.currentPeriodStart?.toISOString() ?? null,
        purchase.currentPeriodEnd?.toISOString() ?? null,
        purchase.cancelAtPeriodEnd,
        purchase.canceledAt?.toISOString() ?? null,
      ],
    )
    .catch((error: unknown) => {
      logger.error(
        { error, userId, platform, productId, planTier: purchase.planTier },
        'iap/verify: failed to upsert subscription',
      );
      throw createError.internal('Failed to record verified purchase');
    });

  const subscriptionId = upserted[0]?.id;

  if (subscriptionId && purchase.currentPeriodStart && purchase.currentPeriodEnd) {
    try {
      await SubscriptionService.allocateCreditsForPeriod(
        userId,
        subscriptionId,
        purchase.planTier,
        purchase.currentPeriodStart,
        purchase.currentPeriodEnd,
      );
    } catch (creditError) {
      logger.error(
        { error: creditError, userId, subscriptionId, planTier: purchase.planTier },
        'iap/verify: failed to allocate credits for verified purchase',
      );
    }
  }

  logger.info(
    { userId, platform, productId, planTier: purchase.planTier, status: purchase.status },
    'iap/verify: purchase verified and subscription upserted',
  );

  // Public IAP response exposes only the tier, subscription status, and the
  // period end. Private managed-compute allowances (cents/units) must never be
  // serialized to a client; the app derives usage from the percentage-only
  // usage contract instead. See managed-usage-policy.ts.
  return NextResponse.json({
    success: true,
    planTier: purchase.planTier,
    status: purchase.status,
    currentPeriodEnd: purchase.currentPeriodEnd?.toISOString() ?? null,
  });
}

export const POST = withErrorHandler(handleVerify);

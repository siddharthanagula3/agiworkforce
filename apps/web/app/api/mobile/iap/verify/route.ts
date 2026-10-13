import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { MobileIapVerifyResponse } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { resolveMobileIapProduct } from '@/lib/server/mobile-iap-catalog';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';
import { logger } from '@/lib/logger';
import {
  acknowledgeGooglePlayPurchase,
  verifyMobileIapPurchase,
  type VerifiedMobileIapPurchase,
} from '@/lib/server/mobile-iap-store-verification';
import { recordVerifiedMobileIapPurchase } from '@/lib/services/mobile-iap-ledger-service';
import { recordAuditEvent } from '@/lib/security-audit';

const VerifyRequestSchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    productId: z.string().trim().min(1).max(200),
    purchaseToken: z.string().trim().min(20).max(32_000),
  })
  .strict();

// Acknowledged here, after the grant is committed, so a purchase is never left to
// Play's three-day automatic refund because the app closed before it could confirm.
// Play accepts a repeat, and the app still acknowledges when this attempt fails.
async function acknowledgeWithStore(
  verified: VerifiedMobileIapPurchase,
  purchaseToken: string,
): Promise<boolean | undefined> {
  if (verified.platform !== 'android') return undefined;
  if (verified.storeAcknowledged !== false) return verified.storeAcknowledged;
  try {
    await acknowledgeGooglePlayPurchase({ product: verified.product, purchaseToken });
    return true;
  } catch (error) {
    logger.error(
      {
        event: 'store_purchase_not_acknowledged',
        error: error instanceof Error ? error.message : String(error),
        storeTransactionId: verified.storeTransactionId,
      },
      'Google Play did not acknowledge a granted purchase',
    );
    return false;
  }
}

async function handleVerify(request: NextRequest): Promise<NextResponse<MobileIapVerifyResponse>> {
  const rateLimitResponse = await withRateLimit(request, 'mobile-iap-verify');
  if (rateLimitResponse) return rateLimitResponse as NextResponse<MobileIapVerifyResponse>;

  const userId = await requireCurrentUserId(request);
  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse<MobileIapVerifyResponse>;

  const parsed = VerifyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid native purchase verification payload.');
  }
  const product = resolveMobileIapProduct(parsed.data.platform, parsed.data.productId);
  if (!product) throw createError.badRequest('This store product is not registered for AGI.');

  const db = getNeonDb();
  const [account] = await db.query<{ app_account_token: string }>(
    `select app_account_token
       from public.mobile_iap_accounts
      where user_id = $1
      limit 1`,
    [userId],
  );
  if (!account?.app_account_token) {
    throw createError.conflict('Open Billing again before verifying this purchase.');
  }

  const verified = await verifyMobileIapPurchase({
    platform: parsed.data.platform,
    product,
    purchaseToken: parsed.data.purchaseToken,
    appAccountToken: account.app_account_token,
  });
  const result = await recordVerifiedMobileIapPurchase({
    db,
    userId,
    purchaseToken: parsed.data.purchaseToken,
    verified,
  });
  const storeAcknowledged = await acknowledgeWithStore(verified, parsed.data.purchaseToken);
  const scheduledProduct = verified.scheduledProduct;
  const response: MobileIapVerifyResponse = {
    ...result,
    ...(storeAcknowledged === undefined ? {} : { storeAcknowledged }),
    ...(scheduledProduct?.kind === 'subscription'
      ? { scheduledPlanTier: scheduledProduct.planTier }
      : {}),
  };
  await recordAuditEvent({
    userId,
    eventType: 'mobile_purchase_verified',
    request,
    detail: {
      resourceId: result.productKey,
      provider: parsed.data.platform,
      status: result.status,
      ...(result.kind === 'subscription' ? { planTier: result.planTier } : {}),
    },
  });

  return NextResponse.json(response);
}

export const POST = withErrorHandler(handleVerify);
export const runtime = 'nodejs';

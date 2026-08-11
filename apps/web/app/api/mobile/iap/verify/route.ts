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
import { verifyMobileIapPurchase } from '@/lib/server/mobile-iap-store-verification';
import { recordVerifiedMobileIapPurchase } from '@/lib/services/mobile-iap-ledger-service';

const VerifyRequestSchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    productId: z.string().trim().min(1).max(200),
    purchaseToken: z.string().trim().min(20).max(32_000),
  })
  .strict();

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

  return NextResponse.json(result);
}

export const POST = withErrorHandler(handleVerify);
export const runtime = 'nodejs';

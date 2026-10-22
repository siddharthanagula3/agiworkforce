import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  MobileAppTransactionRegistrationRequest,
  MobileAppTransactionRegistrationResponse,
} from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';
import { verifyAppleAppTransaction } from '@/lib/server/mobile-iap-store-verification';
import { registerAppleAppTransaction } from '@/lib/services/mobile-iap-notification-service';

const AppTransactionSchema = z
  .object({ signedAppTransaction: z.string().trim().min(20).max(32_000) })
  .strict() satisfies z.ZodType<MobileAppTransactionRegistrationRequest>;

async function handleAppTransaction(
  request: NextRequest,
): Promise<NextResponse<MobileAppTransactionRegistrationResponse>> {
  const rateLimitResponse = await withRateLimit(request, 'mobile-app-transaction');
  if (rateLimitResponse)
    return rateLimitResponse as NextResponse<MobileAppTransactionRegistrationResponse>;

  const userId = await requireCurrentUserId(request);
  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse<MobileAppTransactionRegistrationResponse>;

  const parsed = AppTransactionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('Invalid app transaction payload.');

  const verified = await verifyAppleAppTransaction(parsed.data.signedAppTransaction);
  const { consentWithdrawn } = await registerAppleAppTransaction({
    db: getNeonDb(),
    userId,
    appTransactionId: verified.appTransactionId,
    environment: verified.environment,
  });
  return NextResponse.json({ registered: true, consentWithdrawn });
}

export const POST = withErrorHandler(handleAppTransaction);
export const runtime = 'nodejs';

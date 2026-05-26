/**
 * POST /api/settings/2fa/verify
 *
 * Verifies a TOTP code entered by the user after scanning the QR code, and
 * enables 2FA on their account.  Must be called after POST /api/settings/2fa/setup.
 *
 * Body: { code: string }  — the 6-digit TOTP code from the authenticator app
 *
 * Returns { success: true } on success or 401 on invalid code.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { verifyTOTPCode, decryptTOTPSecret } from '@/features/settings/services/user-preferences';

interface TwoFactorRow {
  totp_secret_enc: string;
  enabled: boolean;
}

async function handleVerify2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Strict rate limiting: brute force on 6-digit codes is trivial without it
  const rateLimitResponse = await withRateLimit(request, '2fa-verify');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const body = (await request.json()) as { code?: string };
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    throw createError.badRequest('code is required');
  }

  const db = getNeonDb();
  const [row] = await db.query<TwoFactorRow>(
    'select totp_secret_enc, enabled from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row) {
    throw createError.badRequest(
      '2FA setup not initiated — call POST /api/settings/2fa/setup first',
    );
  }

  if (row.enabled) {
    return NextResponse.json({ success: true, message: '2FA is already enabled' });
  }

  const secret = await decryptTOTPSecret(row.totp_secret_enc);
  const valid = await verifyTOTPCode(secret, code);

  if (!valid) {
    logger.warn({ userId }, '2FA verify: invalid TOTP code');
    throw createError.unauthorized('Invalid TOTP code');
  }

  await db.query(
    `update user_two_factor
        set enabled          = true,
            enabled_at       = now(),
            last_verified_at = now(),
            updated_at       = now()
      where user_id = $1`,
    [userId],
  );

  logger.info({ userId }, '2FA enabled successfully');
  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handleVerify2FA);

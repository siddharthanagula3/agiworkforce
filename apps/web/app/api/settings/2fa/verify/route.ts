import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { verifyTOTPCode } from '@/features/settings/services/user-preferences';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { readJsonBody } from '@/lib/read-json-body';

interface TwoFactorRow {
  totp_secret_enc: string;
  enabled: boolean;
}

async function handleVerify2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readJsonBody<{ code?: string }>(request);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    throw createError.badRequest('code is required');
  }

  const [row] = await db.query<TwoFactorRow>(
    'select totp_secret_enc, enabled from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row) {
    throw createError.badRequest(
      '2FA setup not initiated · call POST /api/settings/2fa/setup first',
    );
  }

  if (row.enabled) {
    return NextResponse.json({ success: true, message: '2FA is already enabled' });
  }

  const secret = openTotpSecret(row.totp_secret_enc);
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

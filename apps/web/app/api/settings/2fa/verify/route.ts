import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { isIdentityRequestRejected } from '@agiworkforce/identity';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { generateBackupCodes, verifyTOTPCode } from '@/features/settings/services/user-preferences';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { readJsonBody } from '@/lib/read-json-body';
import { logAuthFailure } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { rememberMfaEnrollment } from '@/lib/mfa-policy-gate';
import { announceTwoFactorChange } from '@/lib/server/two-factor-security-events';
import { requireAuthenticatorEnrollment } from '@/lib/authenticator-enrollment';

async function registerSignInFactor(
  userId: string,
  totpSecret: string,
  backupCodes: readonly string[],
): Promise<void> {
  try {
    await getIdentityProvider().registerSecondFactor(userId, { totpSecret, backupCodes });
  } catch (error) {
    if (!isIdentityRequestRejected(error)) throw error;
    logger.error(
      { userId, code: error.code, message: error.message },
      '2FA verify: the identity provider refused the authenticator',
    );
    throw createError
      .serviceUnavailable(
        'Two-factor sign-in cannot be switched on right now. Nothing changed. Try again later or contact support.',
      )
      .asUserSafe();
  }
}

async function handleVerify2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  requireAuthenticatorEnrollment();

  const body = await readJsonBody<{ code?: string }>(request);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    throw createError.badRequest('code is required');
  }

  const [row] = await db.query<{ totp_secret_enc: string }>(
    `select totp_secret_enc from user_two_factor
      where user_id = $1 and enabled = false and updated_at > now() - interval '30 minutes'
      limit 1`,
    [userId],
  );

  if (!row) {
    throw createError
      .badRequest('Start the authenticator setup again to get a fresh setup key.')
      .asUserSafe();
  }

  const secret = openTotpSecret(row.totp_secret_enc);
  if (!(await verifyTOTPCode(secret, code))) {
    logger.warn({ userId }, '2FA verify: invalid TOTP code');
    await logAuthFailure(request, 'invalid_totp_code', userId);
    throw createError.unauthorized('Invalid TOTP code');
  }

  const backupCodes = generateBackupCodes();
  await registerSignInFactor(userId, secret, backupCodes);
  await db.query('delete from user_two_factor where user_id = $1', [userId]);
  await rememberMfaEnrollment(userId, true);

  logger.info({ userId }, '2FA enabled as a sign-in factor');

  await announceTwoFactorChange({
    userId,
    event: 'two_factor_enabled',
    request,
    organizationId,
    detail: { source: 'totp_code' },
  });

  return NextResponse.json({ success: true, backup_codes: backupCodes });
}

export const POST = withErrorHandler(handleVerify2FA);

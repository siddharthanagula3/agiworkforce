import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getIdentityProvider } from '@/lib/server/identity';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getSessionAccountDb } from '@/lib/server/session-account';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { logger } from '@/lib/logger';
import {
  generateTOTPSecret,
  generateOTPAuthURL,
} from '@/features/settings/services/user-preferences';
import { sealTotpSecret } from '@/lib/crypto/totp-envelope';
import { readSecondFactorStatus } from '@/lib/server/step-up/second-factor';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { requireAuthenticatorEnrollment } from '@/lib/authenticator-enrollment';

async function handleSetup2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, '2fa-setup');
  if (rateLimitResponse) return rateLimitResponse;

  requireAuthenticatorEnrollment();

  const { db, userId, organizationId, sessionIdentity } = await getSessionAccountDb(
    request,
    TWO_FACTOR_SCOPE,
  );
  const identityUser = await getIdentityProvider().getUser(sessionIdentity.subject);
  if (!identityUser || identityUser.id !== sessionIdentity.subject) throw createError.unauthorized();

  if ((await readSecondFactorStatus(db, userId, sessionIdentity.subject)).authenticator) {
    logger.warn({ userId }, '2FA setup refused: account already enrolled');
    throw createError.conflict(
      'Two-factor authentication is already on. Turn it off before setting up a new authenticator.',
    );
  }

  await requireStepUp({
    userId,
    action: 'two_factor.enable',
    organizationId,
    request,
    endpoint: '/api/settings/2fa/setup',
  });

  const secret = generateTOTPSecret();
  const otpauthUrl = generateOTPAuthURL(secret, identityUser.primaryEmail ?? userId);

  let encryptedSecret: string;
  try {
    encryptedSecret = sealTotpSecret(secret);
  } catch (error) {
    logger.error(
      { userId, error: error instanceof Error ? error.message : String(error) },
      '2FA setup encryption is unavailable',
    );
    throw createError
      .serviceUnavailable(
        'Authenticator setup is temporarily unavailable. Try again later or contact support.',
      )
      .asUserSafe();
  }

  await db.query(
    `insert into user_two_factor
       (user_id, totp_secret_enc, backup_codes_hashed, enabled, updated_at)
     values ($1, $2, '{}', false, now())
     on conflict (user_id) do update
       set totp_secret_enc     = excluded.totp_secret_enc,
           backup_codes_hashed = '{}',
           enabled             = false,
           enabled_at          = null,
           updated_at          = now()`,
    [userId, encryptedSecret],
  );

  logger.info({ userId }, '2FA setup initiated (not yet verified)');

  return NextResponse.json({ secret, otpauth_url: otpauthUrl });
}

export const POST = withErrorHandler(handleSetup2FA);

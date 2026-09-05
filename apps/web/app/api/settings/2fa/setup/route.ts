import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { logger } from '@/lib/logger';
import {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateBackupCodes,
  hashBackupCode,
} from '@/features/settings/services/user-preferences';
import { sealTotpSecret } from '@/lib/crypto/totp-envelope';

async function handleSetup2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, '2fa-setup');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);
  const { email } = await getClerkAuthUser(request, TWO_FACTOR_SCOPE);
  const [existing] = await db.query<{ enabled: boolean }>(
    `select enabled from user_two_factor where user_id = $1 limit 1`,
    [userId],
  );
  if (existing?.enabled === true) {
    logger.warn({ userId }, '2FA setup refused: account already enrolled');
    throw createError.conflict(
      'Two-factor authentication is already enabled. Disable it with a valid code before enrolling a new device.',
    );
  }

  const secret = generateTOTPSecret();
  const accountName = email ?? userId;
  const otpauthUrl = generateOTPAuthURL(secret, accountName);
  const backupCodes = generateBackupCodes();

  const hashedCodes = await Promise.all(backupCodes.map((c) => hashBackupCode(c)));

  const encryptedSecret = sealTotpSecret(secret);

  await db.query(
    `insert into user_two_factor
       (user_id, totp_secret_enc, backup_codes_hashed, enabled, backup_codes_generated_at, updated_at)
     values ($1, $2, $3, false, now(), now())
     on conflict (user_id) do update
       set totp_secret_enc         = excluded.totp_secret_enc,
           backup_codes_hashed     = excluded.backup_codes_hashed,
           enabled                 = false,
           enabled_at              = null,
           backup_codes_generated_at = now(),
           updated_at              = now()`,
    [userId, encryptedSecret, hashedCodes],
  );

  logger.info({ userId }, '2FA setup initiated (not yet verified)');

  return NextResponse.json({
    secret,
    otpauth_url: otpauthUrl,
    backup_codes: backupCodes,
  });
}

export const POST = withErrorHandler(handleSetup2FA);

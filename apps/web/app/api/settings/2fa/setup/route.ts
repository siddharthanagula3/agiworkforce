/**
 * POST /api/settings/2fa/setup
 *
 * Generates a new TOTP secret and otpauth:// URL for the authenticated user.
 * The secret is encrypted with TOTP_ENCRYPTION_KEY before being stored.
 * Returns: { secret, otpauth_url, backup_codes }
 *
 * The QR code image is rendered client-side from the returned otpauth_url.
 * Backup codes are returned in plaintext once · they are stored as SHA-256
 * hashes and cannot be retrieved again.
 *
 * 2FA is NOT enabled until the user calls POST /api/settings/2fa/verify with
 * a valid TOTP code, confirming they have successfully enrolled their device.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateBackupCodes,
  hashBackupCode,
  encryptTOTPSecret,
} from '@/features/settings/services/user-preferences';

async function handleSetup2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, '2fa-setup');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId, email } = await getClerkAuthUser(request);

  // Generate TOTP secret and backup codes
  const secret = generateTOTPSecret();
  const accountName = email ?? userId;
  const otpauthUrl = generateOTPAuthURL(secret, accountName);
  const backupCodes = generateBackupCodes();

  // Hash backup codes for storage
  const hashedCodes = await Promise.all(backupCodes.map((c) => hashBackupCode(c)));

  // Encrypt the TOTP secret for storage · will throw if TOTP_ENCRYPTION_KEY is not set
  const encryptedSecret = await encryptTOTPSecret(secret);

  // Upsert into DB (enabled=false until /verify is called)
  const db = getNeonDb();
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

  // Return plaintext backup codes exactly once
  return NextResponse.json({
    secret,
    otpauth_url: otpauthUrl,
    backup_codes: backupCodes,
  });
}

export const POST = withErrorHandler(handleSetup2FA);

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
 *
 * SECURITY: this route refuses to run against an ALREADY-ENABLED account.
 * Its upsert resets `enabled` to false, so without that guard any caller
 * holding a session could strip the second factor by simply starting a new
 * enrollment — bypassing DELETE /api/settings/2fa, which deliberately demands
 * a valid TOTP or backup code "to prevent session-hijack escalation". A
 * session cookie is exactly the thing 2FA exists to survive, so re-enrollment
 * must go through the code-verified disable path first.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { createError } from '@/lib/errors';
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

  const db = getNeonDb();
  const existing = await db.query<{ enabled: boolean }>(
    `select enabled from user_two_factor where user_id = $1`,
    [userId],
  );
  if (existing.rows[0]?.enabled === true) {
    logger.warn({ userId }, '2FA setup refused: account already enrolled');
    throw createError.conflict(
      'Two-factor authentication is already enabled. Disable it with a valid code before enrolling a new device.',
    );
  }

  // Generate TOTP secret and backup codes
  const secret = generateTOTPSecret();
  const accountName = email ?? userId;
  const otpauthUrl = generateOTPAuthURL(secret, accountName);
  const backupCodes = generateBackupCodes();

  // Hash backup codes for storage
  const hashedCodes = await Promise.all(backupCodes.map((c) => hashBackupCode(c)));

  // Encrypt the TOTP secret for storage · will throw if TOTP_ENCRYPTION_KEY is not set
  const encryptedSecret = await encryptTOTPSecret(secret);

  // Upsert into DB (enabled=false until /verify is called). The conflict
  // branch only ever runs for a not-yet-enabled row (guarded above), so
  // resetting enabled/enabled_at here cannot strip a live second factor.
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

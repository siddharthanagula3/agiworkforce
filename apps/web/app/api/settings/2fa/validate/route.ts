/**
 * POST /api/settings/2fa/validate
 *
 * Validates a TOTP code (or backup code) for an already-authenticated user.
 * This is used for sensitive-operation step-up verification (not for login),
 * since Clerk handles primary authentication separately.
 *
 * Design note: This route requires a valid Clerk session.  It intentionally
 * does NOT serve as a Clerk login second-factor endpoint · Clerk's own session
 * model manages that flow.  This endpoint is for in-app step-up auth (e.g.,
 * confirming a destructive action, re-authenticating before viewing secrets).
 *
 * Body: { code: string }
 * Returns: { valid: boolean, used_backup_code?: boolean }
 * Errors: 400 if 2FA is not enabled; 401 if code is invalid; 429 if rate limited
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
import {
  verifyTOTPCode,
  verifyBackupCode,
  decryptTOTPSecret,
} from '@/features/settings/services/user-preferences';
import { readJsonBody } from '@/lib/read-json-body';

interface TwoFactorRow {
  totp_secret_enc: string;
  backup_codes_hashed: string[];
  enabled: boolean;
}

async function handleValidateTOTP(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Strict rate limiting: prevents brute force on 6-digit codes
  // AUDIT-FIX GOV-16: key the TOTP attempt limit on the authenticated user, not
  // the source IP. rateLimitConfigs['2fa-verify'] documents itself as "5 attempts
  // per 15 minutes per user", but withRateLimit falls back to an IP bucket when
  // no identifier is passed — so the control failed in both directions: an
  // attacker rotating source IPs got unlimited 6-digit guesses, while colleagues
  // behind one corporate NAT locked each other out. The limit now runs after
  // authentication; there is no pre-auth brute-force surface here because
  // getClerkAuthUser rejects unauthenticated callers before any code is checked.
  const { userId } = await getClerkAuthUser(request);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readJsonBody<{ code?: string }>(request);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    throw createError.badRequest('code is required');
  }

  const db = getNeonDb();
  const [row] = await db.query<TwoFactorRow>(
    'select totp_secret_enc, backup_codes_hashed, enabled from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row || !row.enabled) {
    throw createError.badRequest('2FA is not enabled on this account');
  }

  const secret = await decryptTOTPSecret(row.totp_secret_enc);
  const totpValid = await verifyTOTPCode(secret, code);

  if (totpValid) {
    await db.query(
      'update user_two_factor set last_verified_at = now(), updated_at = now() where user_id = $1',
      [userId],
    );
    return NextResponse.json({ valid: true, used_backup_code: false });
  }

  // Try backup codes
  const backupIndex = await verifyBackupCode(code, row.backup_codes_hashed ?? []);
  if (backupIndex !== -1) {
    // Consume the backup code by removing it from the stored array
    const updatedCodes = (row.backup_codes_hashed ?? []).filter((_, i) => i !== backupIndex);
    await db.query(
      `update user_two_factor
          set backup_codes_hashed = $2,
              last_verified_at    = now(),
              updated_at          = now()
        where user_id = $1`,
      [userId, updatedCodes],
    );
    logger.info({ userId, remaining: updatedCodes.length }, '2FA backup code used');
    return NextResponse.json({ valid: true, used_backup_code: true });
  }

  logger.warn({ userId }, '2FA validate: invalid code');
  return NextResponse.json({ valid: false }, { status: 401 });
}

export const POST = withErrorHandler(handleValidateTOTP);

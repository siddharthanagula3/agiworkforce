/**
 * POST /api/settings/2fa/backup-codes
 *
 * Regenerates backup codes for the authenticated user.
 * Requires a valid TOTP code to prevent session-hijack escalation.
 *
 * The existing backup codes are invalidated atomically.  New codes are
 * returned in plaintext exactly once · they are stored as SHA-256 hashes.
 *
 * Body: { code: string }  · current TOTP code to authorize regeneration
 * Returns: { backup_codes: string[] }
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
  generateBackupCodes,
  hashBackupCode,
  decryptTOTPSecret,
} from '@/features/settings/services/user-preferences';
import { readJsonBody } from '@/lib/read-json-body';

interface TwoFactorRow {
  totp_secret_enc: string;
  enabled: boolean;
}

async function handleRegenerateBackupCodes(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

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
    throw createError.badRequest('code is required to regenerate backup codes');
  }

  const db = getNeonDb();
  const [row] = await db.query<TwoFactorRow>(
    'select totp_secret_enc, enabled from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row || !row.enabled) {
    throw createError.badRequest('2FA is not enabled on this account');
  }

  // Require a valid TOTP code before regenerating
  const secret = await decryptTOTPSecret(row.totp_secret_enc);
  const valid = await verifyTOTPCode(secret, code);
  if (!valid) {
    logger.warn({ userId }, 'backup-codes regenerate: invalid TOTP code');
    throw createError.unauthorized('Invalid TOTP code');
  }

  const newCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(newCodes.map((c) => hashBackupCode(c)));

  await db.query(
    `update user_two_factor
        set backup_codes_hashed     = $2,
            backup_codes_generated_at = now(),
            last_verified_at        = now(),
            updated_at              = now()
      where user_id = $1`,
    [userId, hashedCodes],
  );

  logger.info({ userId, count: newCodes.length }, '2FA backup codes regenerated');

  return NextResponse.json({ backup_codes: newCodes });
}

export const POST = withErrorHandler(handleRegenerateBackupCodes);

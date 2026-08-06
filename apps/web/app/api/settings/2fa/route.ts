/**
 * GET  /api/settings/2fa  · return 2FA status for the authenticated user
 * DELETE /api/settings/2fa · disable 2FA (requires a valid TOTP code in body)
 *
 * Design note: Clerk supports native TOTP MFA (enrollTotpFactor). We
 * deliberately implement a custom TOTP layer instead because:
 *   1. The full RFC 6238 implementation and encrypted-secret schema already
 *      exist in this repo (encryptTOTPSecret / decryptTOTPSecret).
 *   2. Clerk MFA would require migrating the frontend hooks and settings UI.
 *   3. We need server-side backup-code management independent of Clerk.
 * If Clerk MFA is adopted later, this route family should be removed and the
 * settings service methods updated to call Clerk's SDK directly.
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
import { recordAuditEvent } from '@/lib/security-audit';

// ---------------------------------------------------------------------------
// Shared DB helper
// ---------------------------------------------------------------------------

interface TwoFactorRow {
  user_id: string;
  totp_secret_enc: string;
  backup_codes_hashed: string[];
  enabled: boolean;
  enabled_at: string | null;
  backup_codes_generated_at: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

async function getTwoFactorRow(userId: string): Promise<TwoFactorRow | null> {
  const db = getNeonDb();
  const [row] = await db.query<TwoFactorRow>(
    'select * from user_two_factor where user_id = $1 limit 1',
    [userId],
  );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/settings/2fa
// ---------------------------------------------------------------------------

async function handleGet2FAStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const row = await getTwoFactorRow(userId);

  if (!row || !row.enabled) {
    return NextResponse.json({ enabled: false, backup_codes_remaining: 0 });
  }

  return NextResponse.json({
    enabled: true,
    enabled_at: row.enabled_at,
    backup_codes_remaining: (row.backup_codes_hashed ?? []).length,
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/settings/2fa  · disable 2FA
// Requires a valid TOTP code (or backup code) to prevent session-hijack escalation.
// ---------------------------------------------------------------------------

async function handleDisable2FA(request: NextRequest) {
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
    throw createError.badRequest('code is required to disable 2FA');
  }

  const row = await getTwoFactorRow(userId);
  if (!row || !row.enabled) {
    return NextResponse.json({ success: true, message: '2FA was not enabled' });
  }

  // Verify TOTP code or backup code
  const secret = await decryptTOTPSecret(row.totp_secret_enc);
  const totpValid = await verifyTOTPCode(secret, code);
  let backupCodeIndex = -1;

  if (!totpValid) {
    backupCodeIndex = await verifyBackupCode(code, row.backup_codes_hashed ?? []);
    if (backupCodeIndex === -1) {
      logger.warn({ userId }, '2FA disable: invalid code provided');
      throw createError.unauthorized('Invalid TOTP or backup code');
    }
  }

  // Mark 2FA as disabled · keep the row so re-enroll can detect stale setup
  const db = getNeonDb();

  if (backupCodeIndex !== -1) {
    // Consume the backup code (remove from array)
    const updatedCodes = (row.backup_codes_hashed ?? []).filter((_, i) => i !== backupCodeIndex);
    await db.query(
      `update user_two_factor
          set enabled = false,
              enabled_at = null,
              backup_codes_hashed = $2,
              last_verified_at = now(),
              updated_at = now()
        where user_id = $1`,
      [userId, updatedCodes],
    );
  } else {
    await db.query(
      `update user_two_factor
          set enabled = false,
              enabled_at = null,
              last_verified_at = now(),
              updated_at = now()
        where user_id = $1`,
      [userId],
    );
  }

  logger.info({ userId }, '2FA disabled successfully');

  // Audit: a second factor was removed — a downgrade of the account's own
  // security posture, so it is warning-level. The submitted TOTP/backup code
  // is in scope here and is never recorded; only WHICH factor authorised the
  // change is.
  await recordAuditEvent({
    userId,
    eventType: 'two_factor_disabled',
    severity: 'warning',
    request,
    detail: {
      resourceType: 'two_factor',
      source: backupCodeIndex !== -1 ? 'backup_code' : 'totp_code',
    },
  });

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGet2FAStatus);
export const DELETE = withErrorHandler(handleDisable2FA);

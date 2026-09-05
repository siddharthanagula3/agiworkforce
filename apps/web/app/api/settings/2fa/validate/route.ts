import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { verifyTOTPStep, verifyBackupCode } from '@/features/settings/services/user-preferences';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { readJsonBody } from '@/lib/read-json-body';
import { claimTotpStep } from '@/lib/server/two-factor-replay';

interface TwoFactorRow {
  totp_secret_enc: string;
  backup_codes_hashed: string[];
  last_totp_step: string | number | null;
  enabled: boolean;
}

async function handleValidateTOTP(request: NextRequest) {
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
    'select totp_secret_enc, backup_codes_hashed, enabled, last_totp_step from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row || !row.enabled) {
    throw createError.badRequest('2FA is not enabled on this account');
  }

  const secret = openTotpSecret(row.totp_secret_enc);
  const step = await verifyTOTPStep(secret, code);

  if (step !== null) {
    if (!(await claimTotpStep(db, userId, step))) {
      logger.warn({ userId }, '2FA validate: refused a replayed TOTP code');
      return NextResponse.json({ valid: false }, { status: 401 });
    }
    return NextResponse.json({ valid: true, used_backup_code: false });
  }

  const backupIndex = await verifyBackupCode(code, row.backup_codes_hashed ?? []);
  if (backupIndex !== -1) {
    const usedHash = (row.backup_codes_hashed ?? [])[backupIndex]!;
    // array_remove inside a guarded update makes consumption atomic: reading the
    // array, filtering it and writing it back let two concurrent requests both
    // spend the same code, and the later write could resurrect codes the
    // earlier one had removed.
    const consumed = await db.query<{ remaining: number }>(
      `update user_two_factor
          set backup_codes_hashed = array_remove(backup_codes_hashed, $2),
              last_verified_at    = now(),
              updated_at          = now()
        where user_id = $1
          and $2 = any(backup_codes_hashed)
        returning coalesce(array_length(backup_codes_hashed, 1), 0) as remaining`,
      [userId, usedHash],
    );
    if (!consumed.length) {
      logger.warn({ userId }, '2FA validate: backup code was already spent');
      return NextResponse.json({ valid: false }, { status: 401 });
    }
    logger.info({ userId, remaining: consumed[0]?.remaining ?? 0 }, '2FA backup code used');
    return NextResponse.json({ valid: true, used_backup_code: true });
  }

  logger.warn({ userId }, '2FA validate: invalid code');
  return NextResponse.json({ valid: false }, { status: 401 });
}

export const POST = withErrorHandler(handleValidateTOTP);

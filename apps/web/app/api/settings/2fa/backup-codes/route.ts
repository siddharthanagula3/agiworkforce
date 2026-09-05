import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { claimTotpStep } from '@/lib/server/two-factor-replay';
import {
  verifyTOTPStep,
  generateBackupCodes,
  hashBackupCode,
} from '@/features/settings/services/user-preferences';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { readJsonBody } from '@/lib/read-json-body';

interface TwoFactorRow {
  totp_secret_enc: string;
  enabled: boolean;
}

async function handleRegenerateBackupCodes(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readJsonBody<{ code?: string }>(request);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    throw createError.badRequest('code is required to regenerate backup codes');
  }

  const [row] = await db.query<TwoFactorRow>(
    'select totp_secret_enc, enabled from user_two_factor where user_id = $1 limit 1',
    [userId],
  );

  if (!row || !row.enabled) {
    throw createError.badRequest('2FA is not enabled on this account');
  }

  const secret = openTotpSecret(row.totp_secret_enc);
  const step = await verifyTOTPStep(secret, code);
  if (step === null) {
    logger.warn({ userId }, 'backup-codes regenerate: invalid TOTP code');
    throw createError.unauthorized('Invalid TOTP code');
  }
  if (!(await claimTotpStep(db, userId, step))) {
    logger.warn({ userId }, 'backup-codes regenerate: refused a replayed TOTP code');
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

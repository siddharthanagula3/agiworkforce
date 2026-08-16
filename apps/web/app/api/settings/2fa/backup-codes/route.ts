
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

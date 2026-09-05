import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from './lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { claimTotpStep } from '@/lib/server/two-factor-replay';
import { verifyTOTPStep, verifyBackupCode } from '@/features/settings/services/user-preferences';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

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

async function getTwoFactorRow(db: ScopedDb, userId: string): Promise<TwoFactorRow | null> {
  const [row] = await db.query<TwoFactorRow>(
    'select * from user_two_factor where user_id = $1 limit 1',
    [userId],
  );
  return row ?? null;
}

async function handleGet2FAStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);
  const row = await getTwoFactorRow(db, userId);

  if (!row || !row.enabled) {
    return NextResponse.json({ enabled: false, backup_codes_remaining: 0 });
  }

  return NextResponse.json({
    enabled: true,
    enabled_at: row.enabled_at,
    backup_codes_remaining: (row.backup_codes_hashed ?? []).length,
  });
}

async function handleDisable2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readJsonBody<{ code?: string }>(request);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    throw createError.badRequest('code is required to disable 2FA');
  }

  const row = await getTwoFactorRow(db, userId);
  if (!row || !row.enabled) {
    return NextResponse.json({ success: true, message: '2FA was not enabled' });
  }

  const secret = openTotpSecret(row.totp_secret_enc);
  const step = await verifyTOTPStep(secret, code);
  let backupCodeIndex = -1;

  if (step === null) {
    backupCodeIndex = await verifyBackupCode(code, row.backup_codes_hashed ?? []);
    if (backupCodeIndex === -1) {
      logger.warn({ userId }, '2FA disable: invalid code provided');
      throw createError.unauthorized('Invalid TOTP or backup code');
    }
  } else if (!(await claimTotpStep(db, userId, step))) {
    logger.warn({ userId }, '2FA disable: refused a replayed TOTP code');
    throw createError.unauthorized('Invalid TOTP or backup code');
  }

  if (backupCodeIndex !== -1) {
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

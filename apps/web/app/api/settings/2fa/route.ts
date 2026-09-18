import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from './lib/scope';
import { logger } from '@/lib/logger';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { recordAuditEvent } from '@/lib/security-audit';

const ENDPOINT = '/api/settings/2fa';

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

  const { db, userId, organizationId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  // Ahead of the challenge: an account with 2FA already off has nothing to
  // prove a second factor with, and this answer is idempotent.
  const row = await getTwoFactorRow(db, userId);
  if (!row || !row.enabled) {
    return NextResponse.json({ success: true, message: '2FA was not enabled' });
  }

  const grant = await requireStepUp({
    userId,
    action: 'two_factor.disable',
    organizationId,
    request,
    endpoint: ENDPOINT,
  });

  await db.query(
    `update user_two_factor
        set enabled = false,
            enabled_at = null,
            updated_at = now()
      where user_id = $1`,
    [userId],
  );

  logger.info({ userId }, '2FA disabled successfully');

  await recordAuditEvent({
    userId,
    eventType: 'two_factor_disabled',
    severity: 'warning',
    request,
    organizationId,
    detail: { resourceType: 'two_factor', source: grant.method },
  });

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGet2FAStatus);
export const DELETE = withErrorHandler(handleDisable2FA);

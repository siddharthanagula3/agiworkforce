import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { readJsonBody } from '@/lib/read-json-body';
import { verifySecondFactor, type StepUpFactorFailure } from '@/lib/server/step-up/verify-factor';
import { logAuthFailure } from '@/lib/security-audit';

const FAILURE_AUDIT_REASON: Record<Exclude<StepUpFactorFailure, 'not_enrolled'>, string> = {
  replayed_code: 'replayed_totp_code',
  spent_backup_code: 'spent_backup_code',
  invalid_code: 'invalid_two_factor_code',
};

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

  const result = await verifySecondFactor(db, userId, code);

  if (result.ok) {
    if (result.method === 'backup_code') {
      logger.info({ userId, remaining: result.backupCodesRemaining ?? 0 }, '2FA backup code used');
    }
    return NextResponse.json({ valid: true, used_backup_code: result.method === 'backup_code' });
  }

  if (result.failure === 'not_enrolled') {
    throw createError.badRequest('2FA is not enabled on this account');
  }

  logger.warn({ userId, failure: result.failure }, '2FA validate: code refused');
  await logAuthFailure(request, FAILURE_AUDIT_REASON[result.failure], userId);
  return NextResponse.json({ valid: false }, { status: 401 });
}

export const POST = withErrorHandler(handleValidateTOTP);

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { TWO_FACTOR_SCOPE } from '../lib/scope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { generateBackupCodes } from '@/features/settings/services/user-preferences';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { recordAuditEvent } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { readSecondFactorStatus } from '@/lib/server/step-up/second-factor';
import { announceTwoFactorChange } from '@/lib/server/two-factor-security-events';
import { requireAuthenticatorEnrollment } from '@/lib/authenticator-enrollment';

const ENDPOINT = '/api/settings/2fa/backup-codes';

async function handleRegenerateBackupCodes(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId } = await getUserScopedDb(request, TWO_FACTOR_SCOPE);

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  requireAuthenticatorEnrollment();

  if (!(await readSecondFactorStatus(db, userId)).authenticator) {
    throw createError.badRequest('2FA is not enabled on this account');
  }

  const grant = await requireStepUp({
    userId,
    action: 'two_factor.regenerate_backup_codes',
    organizationId,
    request,
    endpoint: ENDPOINT,
  });

  const newCodes = generateBackupCodes();
  await getIdentityProvider().registerSecondFactor(userId, { backupCodes: newCodes });

  logger.info({ userId, count: newCodes.length }, '2FA backup codes regenerated');

  await recordAuditEvent({
    userId,
    eventType: 'two_factor_backup_codes_regenerated',
    severity: 'warning',
    request,
    organizationId,
    detail: { resourceType: 'two_factor', count: newCodes.length, source: grant.method },
  });

  // The old set stopped working in the statement above, which is a change the
  // account holder has to hear about even when they made it.
  await announceTwoFactorChange({
    userId,
    event: 'backup_codes_regenerated',
    request,
    organizationId,
    detail: { count: newCodes.length, source: grant.method },
  });

  return NextResponse.json({ backup_codes: newCodes });
}

export const POST = withErrorHandler(handleRegenerateBackupCodes);

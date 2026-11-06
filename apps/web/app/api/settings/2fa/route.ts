import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { getSessionAccountDb } from '@/lib/server/session-account';
import { TWO_FACTOR_SCOPE } from './lib/scope';
import { logger } from '@/lib/logger';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { getIdentityProvider } from '@/lib/server/identity';
import { rememberMfaEnrollment } from '@/lib/mfa-policy-gate';
import { readSecondFactorStatus } from '@/lib/server/step-up/second-factor';
import { announceTwoFactorChange } from '@/lib/server/two-factor-security-events';
import { authenticatorEnrollmentAvailable } from '@/lib/authenticator-enrollment';

const ENDPOINT = '/api/settings/2fa';

async function handleGet2FAStatus(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId, sessionIdentity } = await getSessionAccountDb(
    request,
    TWO_FACTOR_SCOPE,
  );
  const status = await readSecondFactorStatus(db, userId, sessionIdentity.subject);

  return NextResponse.json({
    enabled: status.authenticator,
    backup_codes_ready: status.authenticator && status.backupCodes,
    enrollment_available: authenticatorEnrollmentAvailable(),
  });
}

async function handleDisable2FA(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId, sessionIdentity } = await getSessionAccountDb(
    request,
    TWO_FACTOR_SCOPE,
  );

  const rateLimitResponse = await withRateLimit(request, '2fa-verify', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const status = await readSecondFactorStatus(db, userId, sessionIdentity.subject);
  if (!status.authenticator) {
    return NextResponse.json({ success: true, message: '2FA was not enabled' });
  }

  const grant = await requireStepUp({
    userId,
    action: 'two_factor.disable',
    organizationId,
    request,
    endpoint: ENDPOINT,
  });

  await getIdentityProvider().removeSecondFactor(sessionIdentity.subject);
  await db.query('delete from user_two_factor where user_id = $1', [userId]);
  await rememberMfaEnrollment(userId, false);

  logger.info({ userId }, '2FA disabled successfully');

  await announceTwoFactorChange({
    userId,
    identitySubject: sessionIdentity.subject,
    event: 'two_factor_disabled',
    request,
    organizationId,
    detail: { source: grant.method },
  });

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGet2FAStatus);
export const DELETE = withErrorHandler(handleDisable2FA);

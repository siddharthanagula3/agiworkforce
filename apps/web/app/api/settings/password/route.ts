import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isIdentityRequestRejected } from '@agiworkforce/identity';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { readJsonBody } from '@/lib/read-json-body';
import { logAuthFailure } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { readSecondFactorStatus } from '@/lib/server/step-up/second-factor';
import { finishIntentRevocation, revokeEveryOtherSession } from '@/lib/server/session-revocation';
import { announceTwoFactorChange } from '@/lib/server/two-factor-security-events';
import { resolveSessionsPrincipal } from '@/app/api/settings/sessions/session-principal';

const ENDPOINT = '/api/settings/password';

const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(256).optional(),
    newPassword: z.string().min(8).max(256),
  })
  .strict();

async function handleChangePassword(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId, organizationId, currentSessionId } = await resolveSessionsPrincipal(request);

  const parsed = PasswordChangeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid password change', parsed.error.issues);
  }
  const { currentPassword, newPassword } = parsed.data;

  const identity = getIdentityProvider();
  const user = await identity.getUser(userId);
  if (!user) throw createError.unauthorized();
  if (user.passwordEnabled && !currentPassword) {
    throw createError.validation('Enter your current password.').asUserSafe();
  }

  const factors = await readSecondFactorStatus(db, userId);
  const needsReverification =
    !user.passwordEnabled || factors.anySecondFactor || factors.earlierEnrollmentPending;
  const grant = needsReverification
    ? await requireStepUp({
        userId,
        action: 'password.change',
        organizationId,
        request,
        endpoint: ENDPOINT,
      })
    : null;

  const rateLimitResponse = await withRateLimit(request, 'auth-password-reset', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  if (currentPassword && user.passwordEnabled) {
    if (!(await identity.verifyPassword(userId, currentPassword))) {
      await logAuthFailure(request, 'invalid_current_password', userId);
      throw createError.validation('Your current password is not correct.').asUserSafe();
    }
  }
  const source = grant?.method ?? 'current_password';

  try {
    await identity.setPassword(userId, newPassword);
  } catch (error) {
    if (!isIdentityRequestRejected(error)) throw error;
    throw createError.validation(error.message).asUserSafe();
  }

  const signOut = await revokeEveryOtherSession(identity, userId, currentSessionId);
  logger.info(
    { userId, endedCount: signOut.ended.length, failedCount: signOut.failed.length },
    'Password changed; other sessions ended',
  );

  await announceTwoFactorChange({
    userId,
    event: 'password_changed',
    request,
    organizationId,
    detail: { source, count: signOut.ended.length },
  });

  if (!(await finishIntentRevocation(signOut, userId))) {
    throw createError
      .serviceUnavailable(
        'Your password was changed, but signing out your other devices did not finish. End your other sessions in Settings to finish.',
      )
      .asUserSafe();
  }

  return NextResponse.json({
    success: true,
    otherSessionsEnded: signOut.ended.length,
    otherSessionsRemaining: signOut.failed.length,
  });
}

export const POST = withErrorHandler(handleChangePassword);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

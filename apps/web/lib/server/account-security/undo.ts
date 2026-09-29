import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AccountSecurityUndoResponse } from '@agiworkforce/cloud-contracts/account-security';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getIdentityProvider } from '@/lib/server/identity';
import {
  emitIdentitySecurityEvent,
  respondToAccountCompromise,
} from '@/lib/services/identity-events';
import { rememberEnrollment } from './gate';
import { hashUndoToken, newUnusablePassword } from './secrets';
import { readEnrollmentUndo, undoEnrollment } from './store';
import { revokeEveryMobileIntentToken } from '@/lib/server/mobile-intent-tokens';

const LINK_EXPIRED =
  'This link expired or was already used. If you still cannot get into your account, sign in with a passkey, a security key or a recovery key.';

export async function turnOffFromEmailLink(
  ownerDb: DatabaseAdapter,
  token: string,
  request: NextRequest,
): Promise<AccountSecurityUndoResponse> {
  const tokenHash = hashUndoToken(token);
  const open = await readEnrollmentUndo(ownerDb, tokenHash);
  if (!open || !(await undoEnrollment(ownerDb, { userId: open.userId, tokenHash }))) {
    throw createError.notFound(LINK_EXPIRED).asUserSafe();
  }
  await rememberEnrollment(open.userId, null);
  await revokeEveryMobileIntentToken(open.userId);

  const identity = getIdentityProvider();
  let enrollingSessionEnded = false;
  if (open.enrolledSessionId) {
    try {
      await identity.revokeSession(open.enrolledSessionId);
      enrollingSessionEnded = true;
    } catch (error) {
      logger.error(
        { userId: open.userId, error },
        '[account-security] the session that turned it on was not ended; the sweep retries it',
      );
    }
  }

  let passwordReset = false;
  try {
    const user = await identity.getUser(open.userId);
    if (user?.passwordEnabled) {
      await identity.setPassword(open.userId, newUnusablePassword());
      passwordReset = true;
    }
  } catch (error) {
    logger.error(
      { userId: open.userId, error },
      '[account-security] the password was not reset after the emailed link turned it off',
    );
  }

  const contained = await respondToAccountCompromise(ownerDb, identity, {
    userId: open.userId,
    trigger: 'reported',
    request,
  });

  await emitIdentitySecurityEvent(ownerDb, {
    userId: open.userId,
    event: 'advanced_security_disabled',
    subjectRef: new Date().toISOString(),
    context: passwordReset
      ? 'It was turned off from the link emailed when it was turned on, every session was signed out and the password was reset. Choose a new one with Forgot password on the sign-in screen.'
      : 'It was turned off from the link emailed when it was turned on, and every session was signed out. Change your password now.',
    request,
    detail: { source: 'email_link', deleted: contained.deviceCredentialsRevoked },
  });

  return {
    sessionsSignedOut: contained.sessionsRevoked + (enrollingSessionEnded ? 1 : 0),
    passwordReset,
  };
}

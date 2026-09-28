import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AccountSecurityUndoResponse } from '@agiworkforce/cloud-contracts/account-security';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getIdentityProvider } from '@/lib/server/identity';
import { revokeEveryDeviceRefreshCredential } from '@/lib/server/refresh-token-family';
import { revokeEveryOtherSession } from '@/lib/server/session-revocation';
import { emitIdentitySecurityEvent } from '@/lib/services/identity-events';
import { rememberEnrollment } from './gate';
import { hashUndoToken } from './secrets';
import { readEnrollmentUndo, undoEnrollment } from './store';

const LINK_EXPIRED =
  'This link expired or was already used. If you still cannot get into your account, contact support from the sign-in page.';

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
  const devicesSignedOut = await revokeEveryDeviceRefreshCredential(ownerDb, open.userId);
  const sweep = await revokeEveryOtherSession(identity, open.userId, null);
  if (sweep.failed.length > 0 || sweep.incomplete) {
    logger.error(
      { userId: open.userId, failedCount: sweep.failed.length, incomplete: sweep.incomplete },
      '[account-security] some sessions were not ended after the emailed link turned it off',
    );
  }

  await emitIdentitySecurityEvent(ownerDb, {
    userId: open.userId,
    event: 'advanced_security_disabled',
    subjectRef: new Date().toISOString(),
    context:
      'It was turned off from the link emailed when it was turned on, and every session was signed out. Change your password now.',
    request,
    detail: { source: 'email_link', deleted: devicesSignedOut },
  });

  return {
    sessionsSignedOut:
      sweep.ended.length + sweep.alreadyGone.length + (enrollingSessionEnded ? 1 : 0),
  };
}

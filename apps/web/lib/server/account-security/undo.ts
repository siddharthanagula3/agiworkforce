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
import {
  claimUndoCleanup,
  endUndoCleanup,
  readEnrollmentUndo,
  recordUndoCleanupStep,
  undoEnrollment,
  type UndoCleanupProgress,
} from './store';
import { revokeEveryMobileIntentToken } from '@/lib/server/mobile-intent-tokens';

const CLEANUP_LEASE_SECONDS = 120;

const LINK_EXPIRED =
  'This link expired or was already used. If you still cannot get into your account, sign in with a passkey, a security key or a recovery key.';

const CLEANUP_BUSY =
  'This link is already being finished. Open it again from the email in a few minutes if you still need it.';

const CLEANUP_UNFINISHED =
  'Advanced Account Security was turned off, but part of the cleanup did not finish. Open the link from the email again to finish it, and sign in to review your sign-in methods and active sessions.';

function isSettled(progress: UndoCleanupProgress): boolean {
  return Boolean(
    progress.enrollmentForgotten &&
    progress.mobileIntentsRevoked &&
    progress.enrollingSession &&
    progress.password &&
    progress.containment &&
    progress.notified,
  );
}

export async function turnOffFromEmailLink(
  ownerDb: DatabaseAdapter,
  token: string,
  request: NextRequest,
): Promise<AccountSecurityUndoResponse> {
  const tokenHash = hashUndoToken(token);
  const open = await readEnrollmentUndo(ownerDb, tokenHash);
  if (open) await undoEnrollment(ownerDb, { userId: open.userId, tokenHash });

  const claim = await claimUndoCleanup(ownerDb, { tokenHash, leaseSeconds: CLEANUP_LEASE_SECONDS });
  if (claim.status === 'busy') throw createError.conflict(CLEANUP_BUSY).asUserSafe();
  if (claim.status === 'none') throw createError.notFound(LINK_EXPIRED).asUserSafe();

  const { userId } = claim;
  const progress: UndoCleanupProgress = { ...claim.progress };
  const failures: unknown[] = [];

  const settle = async (settled: UndoCleanupProgress) => {
    Object.assign(progress, settled);
    if (!(await recordUndoCleanupStep(ownerDb, { userId, tokenHash, settled }))) {
      throw new Error('The cleanup record for this link no longer exists');
    }
  };

  const attempt = async (step: string, mandatory: boolean, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      logger.error(
        { userId, step, error },
        '[account-security] an emailed-link cleanup step did not finish; opening the link again retries it',
      );
      if (mandatory) failures.push(error);
    }
  };

  try {
    if (!progress.enrollmentForgotten) {
      await attempt('enrollment', true, async () => {
        await rememberEnrollment(userId, null);
        await settle({ enrollmentForgotten: true });
      });
    }
    if (!progress.mobileIntentsRevoked) {
      await attempt('mobile_intents', true, async () => {
        await revokeEveryMobileIntentToken(userId);
        await settle({ mobileIntentsRevoked: true });
      });
    }

    const identity = getIdentityProvider();

    if (!progress.enrollingSession) {
      await attempt('enrolling_session', false, async () => {
        if (!progress.enrolledSessionId) {
          await settle({ enrollingSession: 'none' });
          return;
        }
        await identity.revokeSession(progress.enrolledSessionId);
        await settle({ enrollingSession: 'ended' });
      });
    }

    if (!progress.password) {
      await attempt('password', false, async () => {
        const user = await identity.getUser(userId);
        if (!user?.passwordEnabled) {
          await settle({ password: 'not_set' });
          return;
        }
        await identity.setPassword(userId, newUnusablePassword());
        await settle({ password: 'reset' });
      });
    }

    let containment = progress.containment ?? null;
    if (!containment) {
      await attempt('containment', true, async () => {
        const contained = await respondToAccountCompromise(ownerDb, identity, {
          userId,
          trigger: 'reported',
          request,
        });
        containment = {
          sessionsRevoked: contained.sessionsRevoked,
          deviceCredentialsRevoked: contained.deviceCredentialsRevoked,
        };
        if (contained.sessionsFailed === 0) await settle({ containment });
      });
    }

    if (!progress.notified) {
      await attempt('notice', true, async () => {
        await emitIdentitySecurityEvent(ownerDb, {
          userId,
          event: 'advanced_security_disabled',
          subjectRef: new Date().toISOString(),
          context:
            'Advanced Account Security was turned off from the emailed link. Review your sign-in methods and active sessions. Account recovery may need further attention.',
          request,
          detail: {
            source: 'email_link',
            deleted: containment?.deviceCredentialsRevoked ?? 0,
          },
        });
        await settle({ notified: true });
      });
    }

    if (failures.length > 0) {
      throw createError.serviceUnavailable(CLEANUP_UNFINISHED).asUserSafe();
    }
    return {
      sessionsSignedOut:
        (containment?.sessionsRevoked ?? 0) + (progress.enrollingSession === 'ended' ? 1 : 0),
      passwordReset: progress.password === 'reset',
    };
  } finally {
    await endUndoCleanup(ownerDb, { userId, tokenHash, finished: isSettled(progress) });
  }
}

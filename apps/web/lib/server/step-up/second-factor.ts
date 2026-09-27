import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isIdentityRequestRejected } from '@agiworkforce/identity';
import { openTotpSecret } from '@/lib/crypto/totp-envelope';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { rememberMfaEnrollment } from '@/lib/mfa-policy-gate';
import { getIdentityProvider } from '@/lib/server/identity';
import type { StepUpLevel } from './actions';

export interface SecondFactorStatus {
  authenticator: boolean;
  backupCodes: boolean;
  anySecondFactor: boolean;
  earlierEnrollmentPending: boolean;
}

async function authenticatorRegistered(userId: string): Promise<boolean> {
  const user = await getIdentityProvider()
    .getUser(userId)
    .catch(() => null);
  return user?.totpEnabled === true;
}

async function registerEarlierEnrollment(
  db: DatabaseAdapter,
  userId: string,
  status: SecondFactorStatus,
): Promise<SecondFactorStatus> {
  const [earlier] = await db.query<{ totp_secret_enc: string }>(
    'select totp_secret_enc from user_two_factor where user_id = $1 and enabled = true limit 1',
    [userId],
  );
  if (!earlier) return status;

  let registered = status;
  if (!status.authenticator) {
    try {
      await getIdentityProvider().registerSecondFactor(userId, {
        totpSecret: openTotpSecret(earlier.totp_secret_enc),
      });
    } catch (error) {
      if (!(await authenticatorRegistered(userId))) {
        logger.error(
          isIdentityRequestRejected(error)
            ? { userId, code: error.code, message: error.message }
            : { userId, error: error instanceof Error ? error.message : String(error) },
          'An earlier authenticator enrollment could not be registered as a sign-in factor yet',
        );
        return { ...status, earlierEnrollmentPending: true };
      }
    }
    registered = { ...status, authenticator: true, anySecondFactor: true };
    await rememberMfaEnrollment(userId, true);
    logger.info({ userId }, 'Registered an earlier authenticator enrollment as a sign-in factor');
  }

  await db.query('delete from user_two_factor where user_id = $1 and enabled = true', [userId]);
  return registered;
}

export async function readSecondFactorStatus(
  db: DatabaseAdapter,
  userId: string,
): Promise<SecondFactorStatus> {
  const user = await getIdentityProvider().getUser(userId);
  return registerEarlierEnrollment(db, userId, {
    authenticator: user?.totpEnabled === true,
    backupCodes: user?.backupCodesEnabled === true,
    anySecondFactor: user?.twoFactorEnabled === true,
    earlierEnrollmentPending: false,
  });
}

export async function stepUpLevelFor(db: DatabaseAdapter, userId: string): Promise<StepUpLevel> {
  const status = await readSecondFactorStatus(db, userId);
  if (status.earlierEnrollmentPending) {
    throw createError
      .serviceUnavailable(
        'Your authenticator app cannot confirm this right now. Nothing changed. Try again in a few minutes, or contact support if this keeps happening.',
      )
      .asUserSafe();
  }
  return status.anySecondFactor ? 'second_factor' : 'first_factor';
}

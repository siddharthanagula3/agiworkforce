import 'server-only';

import type { NextRequest } from 'next/server';
import { AppError, ErrorCode, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getIdentityUser } from '@/lib/server/identity';
import { getKeyValueStore } from '@/lib/server/key-value';
import { resolveMfaPolicy } from '@/lib/services/organization-policy-gate';
import { evaluateOrganizationPolicy } from '@/lib/services/organization-policy-evaluator';

const MFA_ENROLLMENT_CACHE_PREFIX = 'mfa-enrolled:';
const MFA_ENROLLMENT_CACHE_TTL_SECONDS = 300;
const MFA_ENROLLMENT_CACHE_ENROLLED = 'enrolled';
const MFA_ENROLLMENT_CACHE_UNENROLLED = 'unenrolled';
const MFA_REQUIRED_ERROR_REASON = 'mfa_required';

type CachedMfaEnrollment =
  | typeof MFA_ENROLLMENT_CACHE_ENROLLED
  | typeof MFA_ENROLLMENT_CACHE_UNENROLLED;

export class MfaRequiredError extends AppError {
  constructor(message: string) {
    super(ErrorCode.MFA_REQUIRED, message, 403, { reason: MFA_REQUIRED_ERROR_REASON });
    this.name = 'MfaRequiredError';
    Object.setPrototypeOf(this, MfaRequiredError.prototype);
  }
}

export function isMfaRequiredError(error: unknown): error is MfaRequiredError {
  return (
    isAppError(error) &&
    (error.details as { reason?: unknown } | undefined)?.reason === MFA_REQUIRED_ERROR_REASON
  );
}

export async function resolveMfaEnrolled(userId: string): Promise<boolean> {
  const store = getKeyValueStore();
  const cacheKey = `${MFA_ENROLLMENT_CACHE_PREFIX}${userId}`;

  if (store) {
    try {
      const cached = await store.get<CachedMfaEnrollment>(cacheKey);
      if (cached === MFA_ENROLLMENT_CACHE_ENROLLED) return true;
      if (cached === MFA_ENROLLMENT_CACHE_UNENROLLED) return false;
    } catch (error) {
      logger.warn({ error, userId }, '[mfa-policy] enrollment cache read failed');
    }
  }

  let enrolled: boolean;
  try {
    const user = await getIdentityUser(userId);
    enrolled = user?.twoFactorEnabled ?? false;
  } catch (error) {
    logger.error(
      { error, userId },
      '[mfa-policy] identity enrollment lookup failed; failing closed',
    );
    return false;
  }

  if (store) {
    await store
      .set(cacheKey, enrolled ? MFA_ENROLLMENT_CACHE_ENROLLED : MFA_ENROLLMENT_CACHE_UNENROLLED, {
        ttlSeconds: MFA_ENROLLMENT_CACHE_TTL_SECONDS,
      })
      .catch((error) => {
        logger.warn({ error, userId }, '[mfa-policy] enrollment cache write failed');
      });
  }

  return enrolled;
}

export async function assertMfaPolicy(userId: string, request: NextRequest): Promise<void> {
  const { policy, organizationId } = await resolveMfaPolicy(getNeonDb(), userId, request);
  if (!policy || !policy.requireMfa || !organizationId) return;

  const mfaEnrolled = await resolveMfaEnrolled(userId);
  const decision = evaluateOrganizationPolicy(policy, { resource: 'mfa', mfaEnrolled });
  if (decision.allowed) return;

  logger.warn(
    { userId, organizationId, code: decision.code },
    '[mfa-policy] request refused by workspace mfa policy',
  );

  throw new MfaRequiredError(decision.reason);
}

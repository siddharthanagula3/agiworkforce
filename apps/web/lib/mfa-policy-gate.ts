import 'server-only';

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
  typeof MFA_ENROLLMENT_CACHE_ENROLLED | typeof MFA_ENROLLMENT_CACHE_UNENROLLED;

export interface MfaSessionIdentity {
  readonly subject: string;
}

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

function enrollmentCacheKey(userId: string): string {
  return `${MFA_ENROLLMENT_CACHE_PREFIX}${userId}`;
}

export async function rememberMfaEnrollment(userId: string, enrolled: boolean): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  await store
    .set(
      enrollmentCacheKey(userId),
      enrolled ? MFA_ENROLLMENT_CACHE_ENROLLED : MFA_ENROLLMENT_CACHE_UNENROLLED,
      { ttlSeconds: MFA_ENROLLMENT_CACHE_TTL_SECONDS },
    )
    .catch((error) => {
      logger.warn({ error, userId }, '[mfa-policy] enrollment cache write failed');
    });
}

export async function resolveMfaEnrolled(
  userId: string,
  sessionIdentity?: MfaSessionIdentity,
): Promise<boolean> {
  if (sessionIdentity) return resolveSessionMfaEnrolled(userId, sessionIdentity);

  const store = getKeyValueStore();
  const cacheKey = enrollmentCacheKey(userId);

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

  await rememberMfaEnrollment(userId, enrolled);

  return enrolled;
}

async function mfaPolicyRefusal(
  userId: string,
  sessionIdentity?: MfaSessionIdentity,
): Promise<{ organizationId: string; code: string; reason: string } | null> {
  const { policy, organizationId } = await resolveMfaPolicy(getNeonDb(), userId);
  if (!policy || !policy.requireMfa || !organizationId) return null;

  const mfaEnrolled = await resolveMfaEnrolled(userId, sessionIdentity);
  const decision = evaluateOrganizationPolicy(policy, { resource: 'mfa', mfaEnrolled });
  if (decision.allowed) return null;
  return { organizationId, code: decision.code, reason: decision.reason };
}

async function resolveSessionMfaEnrolled(
  userId: string,
  { subject }: MfaSessionIdentity,
): Promise<boolean> {
  if (!subject.trim()) return false;
  // Product enrollment caches cannot attest to the identity that authenticated this request.
  try {
    const user = await getIdentityUser(subject);
    return user?.id === subject && user.twoFactorEnabled === true;
  } catch (error) {
    logger.error(
      { error, userId },
      '[mfa-policy] session enrollment lookup failed; failing closed',
    );
    return false;
  }
}

export async function isBlockedByMfaPolicy(
  userId: string,
  sessionIdentity?: MfaSessionIdentity,
): Promise<boolean> {
  return (await mfaPolicyRefusal(userId, sessionIdentity)) !== null;
}

export async function assertMfaPolicy(
  userId: string,
  sessionIdentity?: MfaSessionIdentity,
): Promise<void> {
  const refusal = await mfaPolicyRefusal(userId, sessionIdentity);
  if (!refusal) return;

  logger.warn(
    { userId, organizationId: refusal.organizationId, code: refusal.code },
    '[mfa-policy] request refused by workspace mfa policy',
  );

  throw new MfaRequiredError(refusal.reason);
}

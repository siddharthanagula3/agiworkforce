import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getSharedRedisClient } from '@/lib/rate-limit';
import { resolveMfaPolicy } from '@/lib/services/organization-policy-gate';
import { evaluateOrganizationPolicy } from '@/lib/services/organization-policy-evaluator';

const MFA_ENROLLMENT_CACHE_PREFIX = 'mfa-enrolled:';
const MFA_ENROLLMENT_CACHE_TTL_SECONDS = 300;
const MFA_ENROLLMENT_CACHE_ENROLLED = 'enrolled';
const MFA_ENROLLMENT_CACHE_UNENROLLED = 'unenrolled';

type CachedMfaEnrollment =
  | typeof MFA_ENROLLMENT_CACHE_ENROLLED
  | typeof MFA_ENROLLMENT_CACHE_UNENROLLED;

async function resolveMfaEnrolled(userId: string): Promise<boolean> {
  const redis = getSharedRedisClient();
  const cacheKey = `${MFA_ENROLLMENT_CACHE_PREFIX}${userId}`;

  if (redis) {
    try {
      const cached = await redis.get<CachedMfaEnrollment>(cacheKey);
      if (cached === MFA_ENROLLMENT_CACHE_ENROLLED) return true;
      if (cached === MFA_ENROLLMENT_CACHE_UNENROLLED) return false;
    } catch (error) {
      logger.warn({ error, userId }, '[mfa-policy] enrollment cache read failed');
    }
  }

  let enrolled: boolean;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    enrolled = user.twoFactorEnabled;
  } catch (error) {
    logger.error({ error, userId }, '[mfa-policy] clerk enrollment lookup failed; failing closed');
    return false;
  }

  if (redis) {
    await redis
      .set(cacheKey, enrolled ? MFA_ENROLLMENT_CACHE_ENROLLED : MFA_ENROLLMENT_CACHE_UNENROLLED, {
        ex: MFA_ENROLLMENT_CACHE_TTL_SECONDS,
      })
      .catch((error) => {
        logger.warn({ error, userId }, '[mfa-policy] enrollment cache write failed');
      });
  }

  return enrolled;
}

export async function buildMfaPolicyGateResponse(
  userId: string,
  request: NextRequest,
  headers?: HeadersInit,
): Promise<NextResponse | null> {
  const { policy, organizationId } = await resolveMfaPolicy(getNeonDb(), userId, request);
  if (!policy || !policy.requireMfa || !organizationId) return null;

  const mfaEnrolled = await resolveMfaEnrolled(userId);
  const decision = evaluateOrganizationPolicy(policy, { resource: 'mfa', mfaEnrolled });
  if (decision.allowed) return null;

  logger.warn(
    { userId, organizationId, code: decision.code },
    '[mfa-policy] request refused by workspace mfa policy',
  );

  return NextResponse.json(
    { error: { message: decision.reason, type: 'mfa_required', code: decision.code } },
    { status: 403, headers },
  );
}

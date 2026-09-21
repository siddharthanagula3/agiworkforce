import 'server-only';

import type { NextRequest } from 'next/server';
import { getOptionalAuthUser } from '@/lib/api-auth';
import { getOrCreateAnonSession } from '@/lib/csrf';
import { getIdentityUser } from '@/lib/server/identity';
import { logger } from '@/lib/logger';

export interface HandoffRequestIdentity {
  userId: string | null;
  ownerSessionKey: string;
  verifiedEmail: string | null;
  newCookie?: string;
}

const IDENTITY_LOOKUP_TIMEOUT_MS = 1_500;

async function resolveVerifiedEmail(userId: string): Promise<string | null> {
  try {
    const user = await Promise.race([
      getIdentityUser(userId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), IDENTITY_LOOKUP_TIMEOUT_MS)),
    ]);
    return user?.primaryEmail ?? null;
  } catch (error) {
    logger.warn({ error }, 'Support handoff could not resolve a verified email');
    return null;
  }
}

export async function resolveHandoffIdentity(
  request: NextRequest,
  options: { needEmail?: boolean } = {},
): Promise<HandoffRequestIdentity> {
  const userId = (await getOptionalAuthUser(request))?.userId ?? null;

  if (userId) {
    const verifiedEmail = options.needEmail ? await resolveVerifiedEmail(userId) : null;
    return { userId, ownerSessionKey: userId, verifiedEmail };
  }

  const anon = await getOrCreateAnonSession(request);
  return {
    userId: null,
    ownerSessionKey: anon.id,
    verifiedEmail: null,
    ...(anon.newCookie ? { newCookie: anon.newCookie } : {}),
  };
}

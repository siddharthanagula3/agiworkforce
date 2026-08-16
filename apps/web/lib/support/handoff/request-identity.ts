
import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { getOrCreateAnonSession } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export interface HandoffRequestIdentity {
  userId: string | null;
  ownerSessionKey: string;
  verifiedEmail: string | null;
  newCookie?: string;
}

const CLERK_LOOKUP_TIMEOUT_MS = 1_500;

async function resolveVerifiedEmail(userId: string): Promise<string | null> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const user = await Promise.race([
      client.users.getUser(userId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CLERK_LOOKUP_TIMEOUT_MS)),
    ]);
    return user?.primaryEmailAddress?.emailAddress ?? null;
  } catch (error) {
    logger.warn({ error }, 'Support handoff could not resolve a verified email');
    return null;
  }
}

export async function resolveHandoffIdentity(
  request: Request,
  options: { needEmail?: boolean } = {},
): Promise<HandoffRequestIdentity> {
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session.userId ?? null;
  } catch {
    userId = null;
  }

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

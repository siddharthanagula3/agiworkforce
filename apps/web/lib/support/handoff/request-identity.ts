/**
 * @file request-identity.ts
 *
 * Resolves WHO is escalating, server-side, for a surface that must work both
 * signed in (web app) and signed out (marketing site).
 *
 * The `ownerSessionKey` returned here is the only thing that ever appears in an
 * ownership predicate. It comes from Clerk when there is a session, and from the
 * `__Host-anon-session-id` cookie otherwise. It is NEVER read from a request
 * body or a query parameter, so a caller cannot name someone else's session.
 *
 * DEV NOTE: `getOrCreateAnonSession` mints a `__Host-` cookie, which browsers
 * only accept over HTTPS. On local plain-HTTP dev the anonymous path therefore
 * mints a fresh owner key per request and a signed-out session cannot be polled.
 * It works in preview and production. This looks like a bug on localhost and is
 * not one.
 */

import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { getOrCreateAnonSession } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export interface HandoffRequestIdentity {
  /** Verified Clerk user id, or null when signed out. */
  userId: string | null;
  /** Ownership key for every scoped query. */
  ownerSessionKey: string;
  /** Verified primary email, when the identity provider had one. */
  verifiedEmail: string | null;
  /** Set this on the response when present, so the anon session persists. */
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
    // Not fatal: the caller falls back to requiring an explicit contact address.
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
    // Clerk can throw outside a route-handler context; signed-out is the safe read.
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

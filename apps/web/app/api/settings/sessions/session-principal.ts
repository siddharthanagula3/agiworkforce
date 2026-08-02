import 'server-only';

import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { createError } from '@/lib/errors';

/**
 * Who is asking about this account's active Clerk sessions, and which of those
 * sessions (if any) is the caller's own.
 *
 * Why this exists: `/api/settings/sessions` used to authenticate through a local
 * `requireBrowserSession()` that called Clerk's `auth()` and required BOTH a
 * `userId` and a `sessionId`. That is satisfiable only by a Clerk browser
 * cookie, so every non-browser first-party client — Desktop, which holds an
 * HS256 device bearer (`apps/desktop/src/services/cloudAccountAuth.ts`), and
 * Mobile, which holds a Clerk session JWT — got a flat 401 and could not show
 * the user their own devices or end them.
 *
 * Identity now resolves through `getClerkAuthUser` (`apps/web/lib/api-auth.ts`),
 * exactly like `/api/settings/2fa` and the other mobile-capable settings routes.
 * That helper is authoritative and unchanged: a present bearer must itself
 * verify (Path 2b) and never falls back to a cookie, and an AGI API key is
 * rejected outright here because no `apiKeyScope` is requested — session
 * revocation is not a public-API capability.
 *
 * The "this device" marker is the part that cannot be faked, so it is resolved
 * honestly per credential:
 *
 *   - Cookie caller → `auth().sessionId`. Unchanged from the previous behavior,
 *     including still requiring a sessionId, so the browser surface keeps its
 *     current-session distinction and its revoke-self ordering exactly.
 *   - Clerk session JWT bearer (Mobile) → the `sid` claim of THAT token, and
 *     only when its `sub` equals the authenticated user. So a mobile client is
 *     correctly told which listed row is itself instead of being invited to
 *     "revoke another device" that is actually its own session.
 *   - First-party device token bearer (Desktop) → `null`. A device token is not
 *     a Clerk session, so NO row in the list is the caller. Callers receive
 *     `currentSessionKnown: false` and must say so rather than implying the
 *     device is missing from the list by mistake.
 */
export interface SessionsPrincipal {
  userId: string;
  /** The caller's own Clerk session id, or null when the caller has none. */
  currentSessionId: string | null;
}

/**
 * Mirrors `getClerkAuthorizedParties()` in `apps/web/lib/api-auth.ts` (which is
 * module-private there). Re-read rather than relaxed: this second verification
 * is only used to LEARN the caller's `sid`, and it must not accept a token the
 * authoritative gate would have rejected.
 */
function clerkAuthorizedParties(): string[] {
  return (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * The `sid` of a Clerk session JWT, or null for anything else (device token,
 * API key, unverifiable token). Returning null is always safe: it means "no row
 * is the caller", which downgrades the UI to an explanation, never to a wrong
 * current-session claim.
 */
async function clerkSessionIdFromBearer(token: string, userId: string): Promise<string | null> {
  // Defensive: `getClerkAuthUser` already rejects API keys on this route family
  // (no apiKeyScope is requested), so this branch should be unreachable. It
  // stays so that a future scope grant cannot silently start feeding an API key
  // into Clerk's JWT verifier.
  if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) return null;

  const secretKey = process.env['CLERK_SECRET_KEY'];
  if (!secretKey) return null;

  try {
    const { verifyToken } = await import('@clerk/backend');
    const authorizedParties = clerkAuthorizedParties();
    const claims = await verifyToken(token, {
      secretKey,
      ...(authorizedParties.length > 0 ? { authorizedParties } : {}),
    });
    // Bind the sid to the principal the route is acting for. Without this a
    // token whose `sub` drifted from the resolved user could mark someone
    // else's row as "current".
    if (claims.sub !== userId) return null;
    const sid = (claims as Record<string, unknown>)['sid'];
    return typeof sid === 'string' && sid.length > 0 ? sid : null;
  } catch {
    return null;
  }
}

export async function resolveSessionsPrincipal(request: NextRequest): Promise<SessionsPrincipal> {
  const authHeader = request.headers.get('authorization');

  // Authoritative identity decision. Throws 401/403 for every rejected caller,
  // including a bearer that does not verify and an API key on this route.
  const { userId } = await getClerkAuthUser(request);

  if (authHeader?.startsWith('Bearer ')) {
    // A bearer request must never consult the cookie session — see
    // WEB-AUTH-BEARER-COOKIE-PRINCIPAL-DIVERGENCE-01 in lib/api-auth.ts.
    return {
      userId,
      currentSessionId: await clerkSessionIdFromBearer(authHeader.slice(7), userId),
    };
  }

  const { sessionId } = await auth();
  if (!sessionId) {
    throw createError.unauthorized('Authentication required');
  }
  return { userId, currentSessionId: sessionId };
}

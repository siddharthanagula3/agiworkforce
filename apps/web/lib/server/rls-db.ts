import 'server-only';

import type { NextRequest } from 'next/server';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { assertAccountActive } from '@/lib/api-auth';

let rlsDb: DatabaseAdapter | null = null;

/**
 * A Neon adapter that PERMITS `withUser()`. Every caller below signature-verifies
 * the JWT UPSTREAM — Clerk `verifyToken` for bearer tokens, or a signed Clerk
 * session token from `getToken()` — before binding its `sub` as the RLS subject,
 * which is exactly the precondition `unsafeAllowUnverifiedJwtSubject` asserts. The
 * default `getNeonDb()` adapter does NOT set this flag, so its `withUser()` throws.
 */
function getRlsCapableDb(): DatabaseAdapter {
  if (!rlsDb) {
    rlsDb = createDatabaseClient({
      provider: 'neon',
      applicationName: 'agi-web-rls',
      unsafeAllowUnverifiedJwtSubject: true,
    });
  }
  return rlsDb;
}

export interface UserScopedDb {
  /** RLS-scoped adapter: each query runs `SET LOCAL ROLE app_rls` + binds the sub. */
  db: DatabaseAdapter;
  /** The bound RLS subject (Clerk user id) — write a user_id that matches this. */
  userId: string;
}

/**
 * Resolve a DatabaseAdapter scoped to the authenticated user via Neon RLS. Every
 * query runs as the NON-BYPASSRLS `app_rls` role with `request.jwt.claim.sub`
 * bound, so the strict `WITH CHECK` policies enforce tenant isolation at the
 * DATABASE level — not merely an app-layer `where user_id = $1` filter.
 *
 * Auth order: bearer token (mobile/desktop) first, then Clerk session (web).
 * Throws 401 when unauthenticated, 403 when the account is suspended.
 */
export async function getUserScopedDb(request: NextRequest): Promise<UserScopedDb> {
  // Path 1: Bearer token (mobile/desktop) — verify the signature, then bind sub.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const secretKey = process.env['CLERK_SECRET_KEY'];
    if (secretKey) {
      try {
        const { verifyToken } = await import('@clerk/backend');
        const claims = await verifyToken(token, { secretKey });
        if (typeof claims.sub === 'string' && claims.sub.length > 0) {
          await assertAccountActive(claims.sub);
          return { db: getRlsCapableDb().withUser(token), userId: claims.sub };
        }
      } catch {
        // Invalid token — fall through to 401.
      }
    }
  }

  // Path 2: Clerk session (browser) — getToken() returns a signed session JWT.
  const { userId, getToken } = await auth();
  if (userId) {
    const token = await getToken();
    if (token) {
      await assertAccountActive(userId);
      return { db: getRlsCapableDb().withUser(token), userId };
    }
  }

  throw createError.unauthorized();
}

import 'server-only';

import type { NextRequest } from 'next/server';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { assertAccountActive, getClerkAuthUser } from '@/lib/api-auth';

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
  // Path 1: Bearer token (mobile/desktop) — validate through the canonical
  // dual-token auth boundary, then bind the verified JWT subject to RLS.
  // `getClerkAuthUser` accepts both Clerk JWTs and first-party developer-device
  // JWTs (including revocation + account-status checks). The old code verified
  // only Clerk JWTs, so Desktop could sign in and use ordinary API routes while
  // every RLS-backed chat/project/settings sync route still returned 401.
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // API keys are valid for stateless REST calls but cannot be used as an RLS
    // JWT because they carry no signed `sub` claim.
    if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) {
      throw createError.unauthorized();
    }
    const { userId } = await getClerkAuthUser(request);
    return { db: getRlsCapableDb().withUser(token), userId };
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

import 'server-only';

import type { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { assertAccountActive, getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  resolveActiveOrganizationId,
  resolveOrganizationMembershipId,
} from '@/lib/services/active-workspace-service';

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
  /** The active organization bound for tenancy policies, or null for personal scope. */
  organizationId: string | null;
}

/**
 * Optional header carrying the workspace the client is currently acting in.
 * When absent, the server resolves the account's durable workspace selection.
 *
 * This is a SCOPE SELECTOR, not a grant. An explicit organization is re-proven
 * against `organization_members` before it reaches the RLS GUC. A stale or
 * forged selection degrades to Personal, and the database independently reads
 * membership again for admin visibility and org writes.
 */
export const ACTIVE_ORG_HEADER = MANAGED_CLOUD_ORGANIZATION_HEADER;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readExplicitActiveOrgId(request: NextRequest): string | null | undefined {
  const raw = request.headers.get(ACTIVE_ORG_HEADER)?.trim();
  if (!raw) return undefined;
  return UUID_RE.test(raw) ? raw : null;
}

async function resolveRequestOrganizationId(
  request: NextRequest,
  userId: string,
): Promise<string | null> {
  const explicit = readExplicitActiveOrgId(request);
  if (explicit !== undefined) {
    return explicit ? resolveOrganizationMembershipId(getNeonDb(), userId, explicit) : null;
  }
  return resolveActiveOrganizationId(getNeonDb(), userId);
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
    const organizationId = await resolveRequestOrganizationId(request, userId);
    return {
      db: getRlsCapableDb().withUser(token).withOrg(organizationId),
      userId,
      organizationId,
    };
  }

  // Path 2: Clerk session (browser) — getToken() returns a signed session JWT.
  const { userId, getToken } = await auth();
  if (userId) {
    const token = await getToken();
    if (token) {
      await assertAccountActive(userId);
      const organizationId = await resolveRequestOrganizationId(request, userId);
      return {
        db: getRlsCapableDb().withUser(token).withOrg(organizationId),
        userId,
        organizationId,
      };
    }
  }

  throw createError.unauthorized();
}

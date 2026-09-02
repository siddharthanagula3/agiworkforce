import 'server-only';

import type { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { assertAccountActive, getClerkAuthUser } from '@/lib/api-auth';
import type { ApiKeyScope } from '@/lib/api-key-scopes';
import { getNeonDb } from '@/lib/server/neon-db';
import { RLS_POOL_TUNING } from '@/lib/server/db-pool-tuning';
import { reportDatabaseConnectionError } from '@/lib/server/db-connection-error';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import {
  resolveActiveOrganizationId,
  resolveOrganizationMembershipId,
} from '@/lib/services/active-workspace-service';

let rlsDb: DatabaseAdapter | null = null;

function getRlsCapableDb(): DatabaseAdapter {
  if (!rlsDb) {
    rlsDb = createDatabaseClient({
      provider: 'neon',
      applicationName: 'agi-web-rls',
      unsafeAllowUnverifiedJwtSubject: true,
      onConnectionError: reportDatabaseConnectionError,
      ...RLS_POOL_TUNING,
    });
  }
  return rlsDb;
}

export interface UserScopedDb {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
}

export interface UserScopedDbOptions {
  apiKeyScope?: ApiKeyScope;
}

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

function isApiKeyToken(token: string): boolean {
  return token.startsWith('sk_live_') || token.startsWith('sk_test_');
}

export async function getUserScopedDb(
  request: NextRequest,
  options: UserScopedDbOptions = {},
): Promise<UserScopedDb> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { userId } = await getClerkAuthUser(request, options);
    const organizationId = await resolveRequestOrganizationId(request, userId);
    return {
      db: isApiKeyToken(token)
        ? createClaimedUserScopedDb(getNeonDb(), { userId, organizationId })
        : getRlsCapableDb().withUser(token).withOrg(organizationId),
      userId,
      organizationId,
    };
  }

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

export interface CurrentUserRlsDb {
  db: DatabaseAdapter;
  userId: string;
}

/**
 * RLS-scoped read access for callers with no `NextRequest` — Server
 * Components, e.g. the root layout rendering telemetry consent server-side
 * (WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01). Deliberately lighter than
 * `getUserScopedDb`: no organization resolution (an extra query most callers
 * here don't need) and no `assertAccountActive` (throwing out of a layout
 * render would break every page for a suspended account instead of just the
 * one action that should be blocked). Returns null rather than throwing when
 * signed out, so callers can fail closed instead of crashing the render.
 */
export async function getCurrentUserRlsDb(): Promise<CurrentUserRlsDb | null> {
  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch {
    // Routes the Clerk proxy matcher excludes have no auth context; auth()
    // throws there, and for this helper that simply means signed out.
    return null;
  }
  const { userId, getToken } = session;
  if (!userId) return null;
  const token = await getToken();
  if (!token) return null;
  return { db: getRlsCapableDb().withUser(token), userId };
}

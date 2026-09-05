import 'server-only';

import type { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { setTenantScope } from '@/lib/observability/trace-context';
import type { ApiKeyScope } from '@/lib/api-key-scopes';
import { getNeonDb } from '@/lib/server/neon-db';
import { RLS_POOL_TUNING } from '@/lib/server/db-pool-tuning';
import { reportDatabaseConnectionError } from '@/lib/server/db-connection-error';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import {
  resolveActiveOrganizationId,
  resolveOrganizationMembershipId,
} from '@/lib/services/active-workspace-service';
import { getCachedActiveOrganizationId } from '@/lib/server/request-context-cache';

let rlsDb: DatabaseAdapter | null = null;

function getRlsCapableDb(): DatabaseAdapter {
  if (!rlsDb) {
    rlsDb = createDatabaseClient({
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
  mfaGateExemptForOwner?: boolean;
  resolveOrganization?: boolean;
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
    if (!explicit) return null;
    const cached = await getCachedActiveOrganizationId(userId);
    if (cached === explicit) return explicit;
    return resolveOrganizationMembershipId(getNeonDb(), userId, explicit);
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
  const resolveOrganization = options.resolveOrganization ?? true;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { userId } = await getClerkAuthUser(request, options);
    const organizationId = resolveOrganization
      ? await resolveRequestOrganizationId(request, userId)
      : null;
    setTenantScope({ userId, organizationId: organizationId ?? undefined });
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
      // The workspace mfa gate and ip allow list live in getClerkAuthUser, so a
      // cookie session that skipped it here reached the database with neither
      // policy applied while the same route on a bearer token was refused.
      await getClerkAuthUser(request, options);
      const organizationId = resolveOrganization
        ? await resolveRequestOrganizationId(request, userId)
        : null;
      setTenantScope({ userId, organizationId: organizationId ?? undefined });
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
  setTenantScope({ userId });
  return { db: getRlsCapableDb().withUser(token), userId };
}

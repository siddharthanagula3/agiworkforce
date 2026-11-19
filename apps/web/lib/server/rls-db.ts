import 'server-only';

import { resolveAuthenticatedSurface } from '@/app/api/llm/v1/chat/completions/lib/request-surface';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import type { NextRequest } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { createDatabaseClient, type DatabaseAdapter } from '@agiworkforce/data-layer';
import type { IdentityRequestAuth } from '@agiworkforce/identity';
import { createError, isAppError } from '@/lib/errors';
import { getClerkAuthUser, getCookieSessionAuthUser, type AuthResult } from '@/lib/api-auth';
import { getRequestIdentity } from '@/lib/server/identity';
import { logger } from '@/lib/logger';
import { traceDatabaseAdapter } from '@/lib/observability/database-span';
import { setTenantScope } from '@/lib/observability/trace-context';
import type { ApiKeyScope } from '@/lib/api-key-scopes';
import { getNeonDb } from '@/lib/server/neon-db';
import { RLS_POOL_TUNING } from '@/lib/server/db-pool-tuning';
import { reportDatabaseConnectionError } from '@/lib/server/db-connection-error';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { subjectSessionPassesAccountSecurity } from '@/lib/server/account-security/gate';

let rlsDb: DatabaseAdapter | null = null;

function getRlsCapableDb(): DatabaseAdapter {
  if (!rlsDb) {
    rlsDb = traceDatabaseAdapter(
      createDatabaseClient({
        applicationName: 'agi-web-rls',
        unsafeAllowUnverifiedJwtSubject: true,
        onConnectionError: reportDatabaseConnectionError,
        ...RLS_POOL_TUNING,
      }),
    );
  }
  return rlsDb;
}

export interface UserScopedDb {
  surface?: CloudChatSurface;
  readonly sessionIdentity?: AuthResult['sessionIdentity'];
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
}

export interface UserScopedDbOptions {
  apiKeyScope?: ApiKeyScope;
  mfaGateExemptForOwner?: boolean;
  mfaEnrollment?: boolean;
  accountSecurityVerification?: boolean;
  resolveOrganization?: boolean;
}

export interface VerifiedBearerPrincipal extends Pick<AuthResult, 'surfaceClass' | 'boundSurface'> {
  userId: string;
  token: string;
}

export const ACTIVE_ORG_HEADER = MANAGED_CLOUD_ORGANIZATION_HEADER;

async function resolveRequestOrganizationId(
  request: NextRequest,
  userId: string,
): Promise<string | null> {
  try {
    return await resolveActiveOrganizationId(getNeonDb(), userId, request);
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error({ error, userId }, 'workspace scope lookup failed; denying request');
    throw createError.serviceUnavailable(
      'Unable to verify workspace scope. Please try again shortly.',
    );
  }
}

function isApiKeyToken(token: string): boolean {
  return token.startsWith('sk_live_') || token.startsWith('sk_test_');
}

async function scopeVerifiedBearer(
  request: NextRequest,
  principal: VerifiedBearerPrincipal,
  resolveOrganization: boolean,
): Promise<UserScopedDb> {
  const organizationId = resolveOrganization
    ? await resolveRequestOrganizationId(request, principal.userId)
    : null;
  setTenantScope({
    userId: principal.userId,
    organizationId: organizationId ?? undefined,
  });
  return {
    surface: resolveAuthenticatedSurface(request, principal),
    db: isApiKeyToken(principal.token)
      ? createClaimedUserScopedDb(getNeonDb(), {
          userId: principal.userId,
          organizationId,
        })
      : getRlsCapableDb().withUser(principal.token).withOrg(organizationId),
    userId: principal.userId,
    organizationId,
  };
}

export async function getVerifiedBearerUserScopedDb(
  request: NextRequest,
  principal: VerifiedBearerPrincipal,
  options: Pick<UserScopedDbOptions, 'resolveOrganization'> = {},
): Promise<UserScopedDb> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${principal.token}`) throw createError.unauthorized();
  return scopeVerifiedBearer(request, principal, options.resolveOrganization ?? true);
}

export async function getUserScopedDb(
  request: NextRequest,
  options: UserScopedDbOptions = {},
): Promise<UserScopedDb> {
  const resolveOrganization = options.resolveOrganization ?? true;
  if (options.mfaGateExemptForOwner && !resolveOrganization) {
    throw createError.forbidden('Owner policy recovery requires a workspace scope');
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const auth = await getClerkAuthUser(request, options);
    if (options.mfaGateExemptForOwner) {
      return scopeAuthenticatedOrganization(
        auth,
        resolveAuthenticatedSurface(request, { ...auth, token }),
      );
    }
    return scopeVerifiedBearer(request, { ...auth, token }, resolveOrganization);
  }

  const session = await getRequestIdentity();
  const { subject: userId, getToken } = session;
  if (userId) {
    const token = await getToken();
    if (token) {
      if (options.mfaGateExemptForOwner) {
        const auth = await getCookieSessionAuthUser(request, session, options);
        return scopeAuthenticatedOrganization(auth, 'web');
      }
      // The workspace mfa gate and ip allow list live in getClerkAuthUser, so a
      // cookie session that skipped it here reached the database with neither
      // policy applied while the same route on a bearer token was refused.
      await getClerkAuthUser(request, options);
      const organizationId = resolveOrganization
        ? await resolveRequestOrganizationId(request, userId)
        : null;
      setTenantScope({ userId, organizationId: organizationId ?? undefined });
      return {
        surface: 'web',
        db: getRlsCapableDb().withUser(token).withOrg(organizationId),
        userId,
        organizationId,
      };
    }
  }

  throw createError.unauthorized();
}

function scopeAuthenticatedOrganization(auth: AuthResult, surface: CloudChatSurface): UserScopedDb {
  const scope = auth.organizationScope;
  if (!scope || scope.userId !== auth.userId) throw createError.unauthorized();
  const { userId, organizationId } = scope;
  const sessionIdentity = auth.sessionIdentity
    ? { subject: auth.sessionIdentity.subject, sessionId: auth.sessionIdentity.sessionId }
    : undefined;
  const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId });
  setTenantScope({ userId, organizationId: organizationId ?? undefined });
  return {
    surface,
    ...(sessionIdentity ? { sessionIdentity } : {}),
    db,
    userId,
    organizationId,
  };
}

export interface CurrentUserRlsDb {
  db: DatabaseAdapter;
  userId: string;
}

export async function getCurrentUserRlsDb(): Promise<CurrentUserRlsDb | null> {
  let session: IdentityRequestAuth;
  try {
    session = await getRequestIdentity();
  } catch {
    // Routes the proxy's session matcher excludes have no auth context; reading
    // the request identity throws there, and for this helper that simply means
    // signed out.
    return null;
  }
  const { subject: userId, sessionId, getToken } = session;
  if (!userId) return null;
  if (!(await subjectSessionPassesAccountSecurity(userId, sessionId))) return null;
  const token = await getToken();
  if (!token) return null;
  setTenantScope({ userId });
  return { db: getRlsCapableDb().withUser(token), userId };
}

export async function getCurrentCookieUserRlsDb(
  request: NextRequest,
): Promise<CurrentUserRlsDb | null> {
  let session: IdentityRequestAuth;
  try {
    session = await getRequestIdentity();
  } catch {
    return null;
  }
  if (!session.subject) return null;

  let principal: AuthResult;
  try {
    principal = await getCookieSessionAuthUser(request, session);
  } catch (error) {
    if (isAppError(error) && (error.statusCode === 401 || error.statusCode === 403)) return null;
    throw error;
  }
  const token = await session.getToken();
  if (!token) return null;
  return { db: getRlsCapableDb().withUser(token), userId: principal.userId };
}

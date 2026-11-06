import 'server-only';

import type { NextRequest } from 'next/server';
import { getClerkAuthUser, type AuthOptions, type AuthResult } from '@/lib/api-auth';
import { createError } from '@/lib/errors';
import { setTenantScope } from '@/lib/observability/trace-context';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import type { UserScopedDb, UserScopedDbOptions } from '@/lib/server/rls-db';

export interface SessionAccount extends AuthResult {
  sessionIdentity: { readonly subject: string; readonly sessionId: string };
}

export async function getSessionAccount(
  request: NextRequest,
  options: AuthOptions = {},
): Promise<SessionAccount> {
  const account = await getClerkAuthUser(request, options);
  const identity = account.sessionIdentity;
  if (!identity?.subject || !identity.sessionId) throw createError.unauthorized();
  return { ...account, sessionIdentity: { subject: identity.subject, sessionId: identity.sessionId } };
}

export async function getSessionAccountDb(
  request: NextRequest,
  options: UserScopedDbOptions = {},
): Promise<UserScopedDb & Pick<SessionAccount, 'sessionIdentity'>> {
  const { userId, sessionIdentity } = await getSessionAccount(request, options);
  const serviceDb = getNeonDb();
  const organizationId = options.resolveOrganization === false
    ? null
    : await resolveActiveOrganizationId(serviceDb, userId, request);
  setTenantScope({ userId, organizationId: organizationId ?? undefined });
  return {
    userId,
    sessionIdentity,
    organizationId,
    db: createClaimedUserScopedDb(serviceDb, { userId, organizationId }),
  };
}

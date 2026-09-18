import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { OrganizationPermission } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { isAdminApiKeyToken, verifyAdminApiKey } from '@/lib/server/admin-api-keys';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  assertServicePrincipalScope,
  servicePrincipalActorId,
} from '@/lib/server/service-principal';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import {
  getTeamAdminAccess,
  requireTeamAdminAccess,
} from '@/app/api/settings/team/team-admin-access';

export interface ComplianceCaller {
  kind: 'member' | 'service_principal';
  db: DatabaseAdapter;
  actorUserId: string;
  organizationId: string;
  role: string;
  keyId: string | null;
  servicePrincipalId: string | null;
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer[ ]+(\S+)$/u.exec(request.headers.get('authorization')?.trim() ?? '');
  return match?.[1] ?? null;
}

export async function resolveComplianceCaller(
  request: NextRequest,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<ComplianceCaller> {
  const token = bearerToken(request);
  if (token !== null) {
    if (!isAdminApiKeyToken(token)) {
      // An automation that presents a bearer token must never be served by the
      // interactive cookie on the same request: the cookie belongs to whoever
      // last signed in on that browser, not to the automation.
      throw createError.unauthorized(
        'This endpoint accepts a workspace API key in the Authorization header. Remove the header to use an interactive session.',
      );
    }
    const db = getNeonDb();
    const verified = await verifyAdminApiKey(db, token);
    if (!verified) {
      throw createError.unauthorized('This workspace API key is invalid, expired or revoked.');
    }
    const access = await getTeamAdminAccess(db, '', verified.organizationId);
    if (!access.canManageTeam) {
      throw createError.forbidden(
        'Workspace API keys require an active Team or Enterprise subscription.',
      );
    }
    assertServicePrincipalScope(verified, permission);
    return {
      kind: 'service_principal',
      db,
      actorUserId: servicePrincipalActorId(verified.principalId),
      organizationId: verified.organizationId,
      role: 'service_principal',
      keyId: verified.keyId,
      servicePrincipalId: verified.principalId,
    };
  }

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  await requireMemberPermission(membership.organizationId, userId, permission, deniedMessage);
  return {
    kind: 'member',
    db,
    actorUserId: userId,
    organizationId: membership.organizationId,
    role: membership.role,
    keyId: null,
    servicePrincipalId: null,
  };
}

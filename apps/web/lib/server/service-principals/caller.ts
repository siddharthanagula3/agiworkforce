import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { OrganizationPermission } from '@agiworkforce/types';

import { createError } from '@/lib/errors';
import { isAdminApiKeyToken } from '@/lib/server/admin-api-keys';
import { resolveComplianceCaller } from '@/lib/server/compliance-caller';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { assertInteractiveMemberActor } from '@/lib/server/service-principal';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { requireMemberPermission } from '@/lib/services/organization-permission-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { workspaceRouteAccess } from './route-access';

export interface WorkspaceApiCaller {
  kind: 'member' | 'service_principal';
  db: DatabaseAdapter;
  actorUserId: string;
  organizationId: string;
  role: string;
  keyId: string | null;
  servicePrincipalId: string | null;
  permissions: ReadonlySet<OrganizationPermission> | null;
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer[ ]+(\S+)$/u.exec(request.headers.get('authorization')?.trim() ?? '');
  return match?.[1] ?? null;
}

export function presentsWorkspaceApiKey(request: Request): boolean {
  return isAdminApiKeyToken(bearerToken(request));
}

/**
 * The general form of a workspace caller. The route declares itself in the
 * access table and this resolves either an interactive member or a service
 * principal against the one permission named there, so an automation can never
 * reach an endpoint at a weaker permission than a person would need.
 */
export async function resolveWorkspaceApiCaller(
  request: NextRequest,
  route: string,
  method: string,
): Promise<WorkspaceApiCaller> {
  const access = workspaceRouteAccess(route, method);
  if (!access) {
    throw new Error(`${method} ${route} has no workspace route access declaration.`);
  }

  if (presentsWorkspaceApiKey(request)) {
    if (access.servicePrincipals === 'members-only') {
      throw createError
        .forbidden('This endpoint is not available to workspace API keys.')
        .asUserSafe();
    }
    const caller = await resolveComplianceCaller(request, access.permission, access.deniedMessage);
    return { ...caller, permissions: null };
  }

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));
  await requireTeamAdminAccess(db, userId, membership.organizationId);
  const permissions = await requireMemberPermission(
    membership.organizationId,
    userId,
    access.permission,
    access.deniedMessage,
  );
  return {
    kind: 'member',
    db,
    actorUserId: userId,
    organizationId: membership.organizationId,
    role: membership.role,
    keyId: null,
    servicePrincipalId: null,
    permissions,
  };
}

export function assertInteractiveCaller(caller: WorkspaceApiCaller, capability: string): void {
  assertInteractiveMemberActor(caller.actorUserId, capability);
}

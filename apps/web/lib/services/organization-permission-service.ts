import 'server-only';

import {
  DEFAULT_WORKSPACE_CONTROLS,
  ENTERPRISE_DENIAL_STAGE,
  evaluateAuthorization,
  isOrganizationPermission,
  type AuthorizationSubject,
  type OrganizationPermission,
  type OrganizationRole,
} from '@agiworkforce/types';
import { EnterpriseDenialError } from '@/lib/authorization/denial';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

export interface OrganizationAccess {
  organizationId: string;
  role: OrganizationRole;
  permissions: ReadonlySet<OrganizationPermission>;
}

interface MembershipAccess {
  role: OrganizationRole | null;
  permissions: ReadonlySet<OrganizationPermission>;
}

// The role comes back with the set because the three Primary Owner permissions
// are answered by the membership row, not by what the grid granted.
async function readMembershipAccess(
  organizationId: string,
  userId: string,
): Promise<MembershipAccess> {
  const [row] = await getNeonDb().query<{ role: OrganizationRole | null; permissions: unknown }>(
    `select (select role
               from public.organization_members
              where organization_id = $1 and user_id = $2 and status = 'active') as role,
            public.organization_member_permissions($1::uuid, $2) as permissions`,
    [organizationId, userId],
  );
  const permissions = Array.isArray(row?.permissions) ? row.permissions : [];
  return {
    role: row?.role ?? null,
    permissions: new Set(permissions.filter(isOrganizationPermission)),
  };
}

export async function resolveOrganizationPermissions(
  organizationId: string,
  userId: string,
): Promise<ReadonlySet<OrganizationPermission>> {
  const [row] = await getNeonDb().query<{ permissions: unknown }>(
    `select public.organization_member_permissions($1::uuid, $2) as permissions`,
    [organizationId, userId],
  );
  const permissions = Array.isArray(row?.permissions) ? row.permissions : [];
  return new Set(permissions.filter(isOrganizationPermission));
}

function refuseNonMember(organizationId: string | null): never {
  throw new EnterpriseDenialError({
    code: 'not_a_member',
    stage: ENTERPRISE_DENIAL_STAGE.not_a_member,
    message: 'You are not a member of this workspace.',
    organizationId,
    policyRevision: 0,
  });
}

// A caller with no membership is refused before the decision function sees it:
// an absent workspace is personal scope there, and personal scope allows all.
function assertPermission(
  input: {
    organizationId: string | null;
    role: OrganizationRole | null;
    permissions: ReadonlySet<OrganizationPermission>;
  },
  permission: OrganizationPermission,
  deniedMessage: string,
): void {
  if (!input.organizationId || !input.role) refuseNonMember(input.organizationId);
  const subject: AuthorizationSubject = {
    organizationId: input.organizationId,
    isMember: true,
    isPrimaryOwner: input.role === 'owner',
    permissions: input.permissions,
    entitledFeatures: null,
    controls: DEFAULT_WORKSPACE_CONTROLS,
    policyRevision: 0,
  };
  const decision = evaluateAuthorization(subject, { permission });
  if (decision.allowed) return;
  throw new EnterpriseDenialError({ ...decision.denial, message: deniedMessage });
}

export async function requireMemberPermission(
  organizationId: string,
  userId: string,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<ReadonlySet<OrganizationPermission>> {
  const access = await readMembershipAccess(organizationId, userId);
  assertPermission(
    { organizationId, role: access.role, permissions: access.permissions },
    permission,
    deniedMessage,
  );
  return access.permissions;
}

export async function resolveOrganizationAccess(
  organizationId: string,
  userId: string,
): Promise<OrganizationAccess | null> {
  const [membership] = await getNeonDb().query<{ role: OrganizationRole }>(
    `select role
       from public.organization_members
      where organization_id = $1 and user_id = $2 and status = 'active'
      limit 1`,
    [organizationId, userId],
  );
  if (!membership) return null;
  return {
    organizationId,
    role: membership.role,
    permissions: await resolveOrganizationPermissions(organizationId, userId),
  };
}

export async function resolveActiveOrganizationAccess(
  userId: string,
): Promise<OrganizationAccess | null> {
  const organizationId = await resolveActiveOrganizationId(getNeonDb(), userId);
  if (!organizationId) return null;
  return resolveOrganizationAccess(organizationId, userId);
}

export function requirePermission(
  access: OrganizationAccess | null,
  permission: OrganizationPermission,
  deniedMessage: string,
): OrganizationAccess {
  if (!access) refuseNonMember(null);
  assertPermission(access, permission, deniedMessage);
  return access;
}

export async function requireOrganizationPermission(
  userId: string,
  organizationId: string,
  permission: OrganizationPermission,
  deniedMessage: string,
): Promise<OrganizationAccess> {
  return requirePermission(
    await resolveOrganizationAccess(organizationId, userId),
    permission,
    deniedMessage,
  );
}

export const SHARE_INTO_WORKSPACE_DENIED_MESSAGE =
  'Your workspace role is read-only, so you cannot share into this workspace. Ask a workspace admin to change your role.';

import {
  canPerformOnResource,
  resolveResourceAccess,
  type ResourceAccessDecision,
  type ResourceAccessInput,
  type ResourceLifecycleState,
  type ResourcePermission,
  type ResourceRole,
  type ResourceVisibility,
} from '@agiworkforce/types';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';

export type OrganizationMemberRole = OrganizationMemberRow['role'];

/**
 * A workspace membership role read as a role on the workspace itself. `admin`
 * stops at `editor` on purpose: transferring and deleting a workspace are the
 * Primary Owner's alone, and that is the whole difference between the two.
 */
export const RESOURCE_ROLE_BY_ORGANIZATION_ROLE: Readonly<
  Record<OrganizationMemberRole, ResourceRole>
> = {
  owner: 'owner',
  admin: 'editor',
  member: 'commenter',
  viewer: 'viewer',
};

export function resourceRoleForOrganizationRole(role: OrganizationMemberRole): ResourceRole {
  return RESOURCE_ROLE_BY_ORGANIZATION_ROLE[role];
}

export interface OrganizationResourceAccessInput {
  organizationId: string;
  viewerUserId: string;
  membership: Pick<OrganizationMemberRow, 'role'> | null;
}

/**
 * The workspace read as a resource. It has no owner column of its own here:
 * ownership is the `owner` membership row, so the grant carries the role and
 * the owner check never falls back to visibility.
 */
export function organizationResourceAccess(
  input: OrganizationResourceAccessInput,
): ResourceAccessInput {
  return {
    visibility: 'organization',
    lifecycleState: 'active',
    ownerUserId: null,
    organizationId: input.organizationId,
    viewer: {
      userId: input.viewerUserId,
      // A non-member is not scoped to this workspace, so `organization`
      // visibility must not reach them the way it reaches a member.
      organizationId: input.membership === null ? null : input.organizationId,
      grantedRole:
        input.membership === null ? null : resourceRoleForOrganizationRole(input.membership.role),
    },
  };
}

export function canPerformOnOrganization(
  input: OrganizationResourceAccessInput,
  permission: ResourcePermission,
): boolean {
  return canPerformOnResource(organizationResourceAccess(input), permission);
}

export interface OwnedResourceAccessInput {
  ownerUserId: string | null;
  organizationId: string | null;
  visibility: ResourceVisibility;
  lifecycleState: ResourceLifecycleState;
  viewerUserId: string | null;
  viewerOrganizationId: string | null;
  grantedRole?: ResourceRole | null;
}

export function ownedResourceAccess(input: OwnedResourceAccessInput): ResourceAccessDecision {
  return resolveResourceAccess({
    visibility: input.visibility,
    lifecycleState: input.lifecycleState,
    ownerUserId: input.ownerUserId,
    organizationId: input.organizationId,
    viewer: {
      userId: input.viewerUserId,
      organizationId: input.viewerOrganizationId,
      grantedRole: input.grantedRole ?? null,
    },
  });
}

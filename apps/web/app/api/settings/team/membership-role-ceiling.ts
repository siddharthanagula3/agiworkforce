import 'server-only';

import {
  BUILT_IN_ORGANIZATION_ROLES,
  builtInRoleKeyForMembershipRole,
  detectPermissionEscalation,
  membershipRolePermissionsBeyondGranter,
  type OrganizationPermission,
  type OrganizationRole,
} from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';

export interface MembershipRoleCeilingInput {
  organizationId: string;
  actorUserId: string;
  /** The member's account id, or the invited address before one exists. */
  subject: string;
  actorPermissions: Iterable<OrganizationPermission>;
  role: OrganizationRole;
  request?: Request;
}

// Holding members.manage says who may move people between roles, never which
// roles they may reach: without this, a custom role carrying members.manage
// alone promotes its holder to admin in one request.
export async function assertMembershipRoleWithinActor(
  input: MembershipRoleCeilingInput,
): Promise<void> {
  const beyond = membershipRolePermissionsBeyondGranter(input.actorPermissions, input.role);
  if (beyond.length === 0) return;

  const escalation = detectPermissionEscalation({
    granterUserId: input.actorUserId,
    subjectUserId: input.subject,
    granterPermissions: input.actorPermissions,
    requestedPermissions: beyond,
  });

  await recordAuditEvent({
    userId: input.actorUserId,
    organizationId: input.organizationId,
    eventType: 'member_role_changed',
    request: input.request,
    outcome: 'denied',
    severity: escalation?.isSelfGrant ? 'critical' : 'warning',
    detail: {
      resourceType: 'organization_member',
      resourceId: input.subject,
      role: input.role,
      scopes: beyond,
    },
  });

  const name = BUILT_IN_ORGANIZATION_ROLES[builtInRoleKeyForMembershipRole(input.role)].name;
  throw createError
    .forbidden(
      `The ${name} role carries permissions you do not hold yourself: ${beyond.join(', ')}.`,
    )
    .asUserSafe();
}

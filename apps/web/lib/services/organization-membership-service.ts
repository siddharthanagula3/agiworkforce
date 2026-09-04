import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { withSeatAccountingErrors } from '@/lib/services/organization-seat-service';
import { persistActiveWorkspaceSelection } from '@/lib/services/active-workspace-service';

export interface LeaveOrganizationResult {
  organizationId: string;
  previousRole: OrganizationMemberRow['role'];
  successorUserId: string | null;
  successorPreviousRole: OrganizationMemberRow['role'] | null;
}

export interface LeaveOrganizationInput {
  userId: string;
  organizationId: string;
  successorUserId?: string;
}

export async function requireOrganizationOwner(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
  action: string,
): Promise<OrganizationMemberRow> {
  const [membership] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
      where organization_id = $1 and user_id = $2
      limit 1`,
    [organizationId, userId],
  );
  if (!membership) {
    throw createError.forbidden('You are not a member of this organization');
  }
  if (membership.role !== 'owner') {
    throw createError.forbidden(`Only the workspace owner can ${action}`);
  }
  return membership;
}

export async function leaveOrganization(
  db: DatabaseAdapter,
  input: LeaveOrganizationInput,
): Promise<LeaveOrganizationResult> {
  const { userId, organizationId } = input;
  return withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-owner:' || $1, 0))`,
        [userId],
      );

      const [membership] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
           from public.organization_members
          where organization_id = $1 and user_id = $2
          limit 1`,
        [organizationId, userId],
      );

      if (!membership) {
        throw createError.notFound('You do not belong to a workspace');
      }

      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [membership.organization_id],
      );

      const [currentMembership] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
           from public.organization_members
          where organization_id = $1 and user_id = $2
          limit 1`,
        [membership.organization_id, userId],
      );

      if (!currentMembership) {
        throw createError.conflict('Your workspace membership changed. Refresh and try again.');
      }
      let successorPreviousRole: OrganizationMemberRow['role'] | null = null;
      if (currentMembership.role === 'owner') {
        if (!input.successorUserId || input.successorUserId === userId) {
          const [memberCount] = await tx.query<{ count: string }>(
            `select count(*)::text as count
               from public.organization_members
              where organization_id = $1`,
            [currentMembership.organization_id],
          );
          if (Number(memberCount?.count ?? 0) <= 1) {
            throw createError.conflict(
              'You are the sole member of this workspace. Leaving is not available for a sole owner; delete the workspace from Settings > Organization instead.',
            );
          }
          throw createError.conflict(
            'Choose another member to become owner before leaving this workspace.',
          );
        }

        const [successor] = await tx.query<OrganizationMemberRow>(
          `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
             from public.organization_members
            where organization_id = $1 and user_id = $2
            limit 1`,
          [currentMembership.organization_id, input.successorUserId],
        );
        if (!successor) {
          throw createError.notFound('The selected successor is not a member of this workspace.');
        }
        successorPreviousRole = successor.role;

        await tx.execute(
          `update public.organization_members
              set role = 'admin'
            where organization_id = $1 and user_id = $2`,
          [currentMembership.organization_id, userId],
        );
        await tx.execute(
          `update public.organization_members
              set role = 'owner'
            where organization_id = $1 and user_id = $2`,
          [currentMembership.organization_id, successor.user_id],
        );
      } else if (input.successorUserId) {
        throw createError.validation('Only the current owner can choose a successor.');
      }

      const [removed] = await tx.query<Pick<OrganizationMemberRow, 'organization_id' | 'role'>>(
        `delete from public.organization_members
          where organization_id = $1 and user_id = $2
          returning organization_id, role`,
        [currentMembership.organization_id, userId],
      );

      if (!removed) {
        throw createError.conflict('Your workspace membership changed. Refresh and try again.');
      }

      await persistActiveWorkspaceSelection(tx, userId, null);

      return {
        organizationId: removed.organization_id,
        previousRole: currentMembership.role,
        successorUserId:
          currentMembership.role === 'owner' ? (input.successorUserId ?? null) : null,
        successorPreviousRole,
      };
    }),
  );
}

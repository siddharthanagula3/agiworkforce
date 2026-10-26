import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudWorkspaceOwnershipTransferSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import { requireStepUp } from '@/lib/server/step-up-auth';
import { withSeatAccountingErrors } from '@/lib/services/organization-seat-service';
import { requireTeamAdminAccess } from '@/app/api/settings/team/team-admin-access';
import { requireEligibleOwnershipSuccessor } from '@/lib/services/organization-membership-service';
import { canPerformOnOrganization } from '@/lib/resources';

async function handleTransfer(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-transfer-ownership');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);

  const body = await request.json().catch(() => ({}));
  const parsed = ManagedCloudWorkspaceOwnershipTransferSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { organizationId, toUserId, outgoingOwnerRole } = parsed.data;

  if (toUserId === userId) {
    throw createError.validation('You are already the owner of this organization');
  }

  await requireStepUp({
    userId,
    action: 'organization.transfer_ownership',
    resourceId: organizationId,
    organizationId,
    request,
    endpoint: '/api/settings/organization/transfer-ownership',
  });

  const db = getNeonDb();
  const access = await requireTeamAdminAccess(db, userId, organizationId);

  await withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [organizationId],
      );

      const [requester] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
           from public.organization_members
          where organization_id = $1 and user_id = $2 and status = 'active'
          limit 1`,
        [organizationId, userId],
      );

      if (!requester) {
        throw createError.forbidden('You are not a member of this organization');
      }
      if (
        !canPerformOnOrganization(
          { organizationId, viewerUserId: userId, membership: requester },
          'transfer',
        )
      ) {
        throw createError.forbidden('Only the Primary Owner can transfer ownership').asUserSafe();
      }

      await requireEligibleOwnershipSuccessor(tx, {
        organizationId,
        successorUserId: toUserId,
        access,
      });

      await tx.execute(
        `update public.organization_members
            set role = $1
          where organization_id = $2 and user_id = $3`,
        [outgoingOwnerRole, organizationId, userId],
      );

      await tx.execute(
        `update public.organization_members
            set role = 'owner'
          where organization_id = $1 and user_id = $2`,
        [organizationId, toUserId],
      );
    }),
  );

  logger.info(
    { userId, organizationId, toUserId, outgoingOwnerRole },
    'Organization ownership transferred',
  );

  await recordAuditEvent({
    userId,
    eventType: 'member_role_changed',
    request,
    organizationId,
    severity: 'warning',
    detail: {
      resourceType: 'organization_member',
      resourceId: toUserId,
      organizationId,
      targetUserId: toUserId,
      previousRole: 'owner',
      role: 'owner',
      reason: 'ownership_transferred',
    },
  });

  return NextResponse.json({
    message: 'Ownership transferred',
    organizationId,
    ownerUserId: toUserId,
    previousOwnerRole: outgoingOwnerRole,
  });
}

export const POST = withErrorHandler(handleTransfer);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

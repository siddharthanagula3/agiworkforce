import { isOrganizationAdminRole } from '@agiworkforce/types';
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import { deprovisionMember } from '@/lib/services/deprovision-service';
import { withSeatAccountingErrors } from '@/lib/services/organization-seat-service';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import { requireTeamAdminAccess } from '../team-admin-access';
import { getIdentityProvider } from '@/lib/server/identity';

const MEMBER_ID_RE = /^([0-9a-f-]{36}):(.+)$/;

const PatchRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

function parseMemberId(raw: string): { organizationId: string; userId: string } {
  const match = MEMBER_ID_RE.exec(raw);
  if (!match) {
    throw createError.validation('memberId must be in the format "<organizationId>:<userId>"');
  }
  return { organizationId: match[1]!, userId: match[2]! };
}

async function requireAdminAccess(
  db: ReturnType<typeof getNeonDb>,
  organizationId: string,
  requesterId: string,
): Promise<OrganizationMemberRow> {
  const [row] = await db.query<OrganizationMemberRow>(
    `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
     from public.organization_members
     where organization_id = $1 and user_id = $2
     limit 1`,
    [organizationId, requesterId],
  );

  if (!row) {
    throw createError.forbidden('You are not a member of this organization');
  }
  if (!isOrganizationAdminRole(row.role)) {
    throw createError.forbidden('Only owners and admins can manage team members');
  }
  return row;
}

async function requireAnotherOwnerBeforeDemotion(
  db: ReturnType<typeof getNeonDb>,
  organizationId: string,
  target: Pick<OrganizationMemberRow, 'role'>,
  nextRole: OrganizationMemberRow['role'] | null,
): Promise<void> {
  if (target.role !== 'owner' || nextRole === 'owner') {
    return;
  }

  const [countRow] = await db.query<{ owner_count: string }>(
    `select count(*)::text as owner_count
     from public.organization_members
     where organization_id = $1 and role = 'owner'`,
    [organizationId],
  );

  if (Number.parseInt(countRow?.owner_count ?? '0', 10) <= 1) {
    throw createError.conflict('Assign another owner before removing or changing the last owner');
  }
}

async function handleRemove(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId: requesterId } = await getUserScopedDb(request);
  const { memberId } = await context.params;
  const { organizationId, userId: targetUserId } = parseMemberId(memberId);

  await requireTeamAdminAccess(db, requesterId, organizationId);

  const removedRole = await withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [organizationId],
      );

      const requester = await requireAdminAccess(tx, organizationId, requesterId);

      if (targetUserId === requesterId) {
        throw createError.validation(
          'You cannot remove yourself. Use the leave organization flow.',
        );
      }

      const [targetRow] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
       where organization_id = $1 and user_id = $2
       limit 1`,
        [organizationId, targetUserId],
      );

      if (!targetRow) {
        throw createError.notFound('Member not found in this organization');
      }

      if (targetRow.role === 'owner' && requester.role !== 'owner') {
        throw createError.forbidden('Only owners can remove other owners');
      }

      await requireAnotherOwnerBeforeDemotion(tx, organizationId, targetRow, null);

      await tx.execute(
        `delete from public.organization_members
       where organization_id = $1 and user_id = $2`,
        [organizationId, targetUserId],
      );

      return targetRow.role;
    }),
  );

  await invalidateActiveOrganizationCache(targetUserId);

  logger.info({ requesterId, organizationId, targetUserId }, 'Team member removed');

  // Dropping the membership row stops the NEXT request from resolving this
  // workspace. It does not stop a signed-in browser, a paired desktop, or a
  // developer key that is already live, the gap between "removed" and
  // "actually cut off" is the offboarding hole a security review looks for.
  // Deliberately after the membership delete: if revocation fails the member is
  // still out of the workspace, and the audit event says what remained.
  const deprovision = await deprovisionMember(getNeonDb(), getIdentityProvider(), {
    userId: targetUserId,
    organizationId,
  });

  await recordAuditEvent({
    userId: requesterId,
    eventType: 'member_removed',
    request,
    organizationId,
    outcome: deprovision.errors.length > 0 ? 'failure' : 'success',
    severity: deprovision.errors.length > 0 ? 'critical' : 'warning',
    detail: {
      resourceType: 'organization_member',
      resourceId: targetUserId,
      organizationId,
      targetUserId,
      previousRole: removedRole,
      count: deprovision.sessionsRevoked,
      reason: deprovision.errors.length > 0 ? deprovision.errors.join('; ') : undefined,
    },
  });

  return NextResponse.json({
    message: 'Member removed',
    // Reported rather than swallowed: an administrator offboarding someone
    // needs to know if a credential is still live.
    revoked: {
      sessions: deprovision.sessionsRevoked,
      deviceTokens: deprovision.deviceTokensRevoked,
      apiKeys: deprovision.apiKeysRevoked,
    },
    warnings: deprovision.errors,
  });
}

async function handleUpdateRole(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId: requesterId } = await getUserScopedDb(request);
  const { memberId } = await context.params;
  const { organizationId, userId: targetUserId } = parseMemberId(memberId);

  const body = await request.json().catch(() => ({}));
  const parsed = PatchRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { role: newRole } = parsed.data;

  await requireTeamAdminAccess(db, requesterId, organizationId);

  const previousRole = await withSeatAccountingErrors(() =>
    db.transaction(async (tx) => {
      await tx.query(
        `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
        [organizationId],
      );

      const requester = await requireAdminAccess(tx, organizationId, requesterId);

      if (newRole === 'owner') {
        throw createError.conflict(
          'An organization has exactly one owner. Use POST /api/settings/organization/transfer-ownership to move ownership.',
        );
      }

      const [targetRow] = await tx.query<OrganizationMemberRow>(
        `select organization_id, user_id, role, provisioning_source, provisioned_at, joined_at
       from public.organization_members
       where organization_id = $1 and user_id = $2
       limit 1`,
        [organizationId, targetUserId],
      );

      if (!targetRow) {
        throw createError.notFound('Member not found in this organization');
      }

      if (targetRow.role === 'owner' && requester.role !== 'owner') {
        throw createError.forbidden('Only owners can change the role of another owner');
      }

      await requireAnotherOwnerBeforeDemotion(tx, organizationId, targetRow, newRole);

      await tx.execute(
        `update public.organization_members
       set role = $1
       where organization_id = $2 and user_id = $3`,
        [newRole, organizationId, targetUserId],
      );

      return targetRow.role;
    }),
  );

  await invalidateActiveOrganizationCache(targetUserId);

  logger.info({ requesterId, organizationId, targetUserId, newRole }, 'Team member role updated');

  await recordAuditEvent({
    userId: requesterId,
    eventType: 'member_role_changed',
    request,
    organizationId,
    severity: newRole === 'owner' || newRole === 'admin' ? 'warning' : 'info',
    detail: {
      resourceType: 'organization_member',
      resourceId: targetUserId,
      organizationId,
      targetUserId,
      previousRole,
      role: newRole,
    },
  });

  return NextResponse.json({ message: 'Role updated', role: newRole });
}

export const DELETE = withErrorHandler(handleRemove);
export const PATCH = withErrorHandler(handleUpdateRole);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

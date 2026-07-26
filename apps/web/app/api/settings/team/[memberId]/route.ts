import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { OrganizationMemberRow } from '@/lib/server/neon-types';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireTeamAdminAccess } from '../team-admin-access';

// memberId param format: "<organizationId>:<userId>" · matches the composite
// key shape returned by the team list route so the caller does not need to
// carry both IDs separately.
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
  if (!['owner', 'admin'].includes(row.role)) {
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

/**
 * DELETE /api/settings/team/[memberId]
 * Remove a member from the organization.
 * memberId = "<organizationId>:<userId>"
 */
async function handleRemove(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId: requesterId } = await getClerkAuthUser(request);
  const { memberId } = await context.params;
  const { organizationId, userId: targetUserId } = parseMemberId(memberId);

  const db = getNeonDb();
  await requireTeamAdminAccess(db, requesterId);

  await db.transaction(async (tx) => {
    await tx.query(
      `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
      [organizationId],
    );

    const requester = await requireAdminAccess(tx, organizationId, requesterId);

    // Prevent self-removal via this endpoint · use a separate leave flow.
    if (targetUserId === requesterId) {
      throw createError.validation('You cannot remove yourself. Use the leave organization flow.');
    }

    // Owners cannot be removed by admins.
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
  });

  logger.info({ requesterId, organizationId, targetUserId }, 'Team member removed');

  return NextResponse.json({ message: 'Member removed' });
}

/**
 * PATCH /api/settings/team/[memberId]
 * Update a member's role.
 * memberId = "<organizationId>:<userId>"
 */
async function handleUpdateRole(
  request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId: requesterId } = await getClerkAuthUser(request);
  const { memberId } = await context.params;
  const { organizationId, userId: targetUserId } = parseMemberId(memberId);

  const body = await request.json().catch(() => ({}));
  const parsed = PatchRoleSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { role: newRole } = parsed.data;

  const db = getNeonDb();
  await requireTeamAdminAccess(db, requesterId);

  await db.transaction(async (tx) => {
    await tx.query(
      `select pg_advisory_xact_lock(hashtextextended('agi:organization-members:' || $1, 0))`,
      [organizationId],
    );

    const requester = await requireAdminAccess(tx, organizationId, requesterId);

    // Only owners can assign the owner role.
    if (newRole === 'owner' && requester.role !== 'owner') {
      throw createError.forbidden('Only owners can assign the owner role');
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
  });

  logger.info({ requesterId, organizationId, targetUserId, newRole }, 'Team member role updated');

  return NextResponse.json({ message: 'Role updated', role: newRole });
}

export const DELETE = withErrorHandler(handleRemove);
export const PATCH = withErrorHandler(handleUpdateRole);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

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
import { recordAuditEvent } from '@/lib/security-audit';
import {
  createInvitation,
  expirePendingInvitations,
  formatInvitation,
  listInvitations,
} from '@/lib/services/organization-invitation-service';
import { getOrganizationSeatState } from '@/lib/services/organization-seat-service';
import { requireTeamAdminAccess } from '../team-admin-access';

const ListQuerySchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
});

const CreateSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
  email: z.string().email('Invalid email address').max(320),
  // `owner` is absent by design: ownership moves only through
  // POST /api/settings/organization/transfer-ownership.
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

/**
 * Every handler here re-proves the caller is an owner/admin OF THE NAMED ORG
 * inside the same request. These routes run on the privileged `getNeonDb()`
 * connection (which has BYPASSRLS), so the organization predicate below is the
 * live isolation boundary — the 0085 policies are defence in depth behind it,
 * not a substitute. A member of org A must never reach org B's invitations.
 */
async function requireOrgAdmin(
  db: ReturnType<typeof getNeonDb>,
  organizationId: string,
  userId: string,
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
  if (!['owner', 'admin'].includes(membership.role)) {
    throw createError.forbidden('Only owners and admins can manage invitations');
  }
  return membership;
}

/**
 * GET /api/settings/team/invitations?organizationId=<uuid>
 * List this organization's invitations plus its live seat state.
 */
async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const { searchParams } = new URL(request.url);
  const parsed = ListQuerySchema.safeParse({
    organizationId: searchParams.get('organizationId') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('organizationId query parameter is required', parsed.error.issues);
  }
  const { organizationId } = parsed.data;

  const db = getNeonDb();
  await requireTeamAdminAccess(db, userId, organizationId);
  await requireOrgAdmin(db, organizationId, userId);

  // Lapsed invitations are flipped before the list is read so the returned
  // status and the returned seat count agree with each other.
  await expirePendingInvitations(db, organizationId);

  const [invitations, seats] = await Promise.all([
    listInvitations(db, organizationId),
    getOrganizationSeatState(db, organizationId),
  ]);

  return NextResponse.json({
    invitations: invitations.map(formatInvitation),
    seats,
  });
}

/**
 * POST /api/settings/team/invitations
 *
 * Persist a pending invitation and return its one-time link.
 *
 * There is NO transactional email provider in this repo, so nothing is
 * delivered. The response says so explicitly and hands back a link the inviter
 * copies. Claiming an email was sent would be the same false claim the
 * delete-account route calls out.
 */
async function handleCreate(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-write');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const body = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { organizationId, email, role } = parsed.data;

  const db = getNeonDb();
  await requireTeamAdminAccess(db, userId, organizationId);
  await requireOrgAdmin(db, organizationId, userId);

  const { invitation, token } = await createInvitation(db, {
    organizationId,
    email,
    role,
    invitedByUserId: userId,
  });

  // The invitation id and address are safe to log; the raw token never is.
  logger.info(
    { userId, organizationId, invitationId: invitation.id, role },
    'Organization invitation created',
  );

  await recordAuditEvent({
    userId,
    eventType: 'member_invited',
    request,
    organizationId,
    detail: {
      resourceType: 'organization_invitation',
      resourceId: invitation.id,
      organizationId,
      role: invitation.role,
    },
  });

  return NextResponse.json(
    {
      invitation: formatInvitation(invitation),
      // Returned exactly once. Only the sha256 hash is persisted.
      inviteToken: token,
      delivery: {
        emailSent: false,
        reason:
          'No transactional email provider is configured. Send this link to the invited address yourself; it expires with the invitation.',
      },
    },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

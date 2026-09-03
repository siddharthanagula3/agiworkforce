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
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

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
  if (!isOrganizationAdminRole(membership.role)) {
    throw createError.forbidden('Only owners and admins can manage invitations');
  }
  return membership;
}

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-list');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const { searchParams } = new URL(request.url);
  const parsed = ListQuerySchema.safeParse({
    organizationId: searchParams.get('organizationId') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('organizationId query parameter is required', parsed.error.issues);
  }
  const { organizationId } = parsed.data;

  await requireTeamAdminAccess(db, userId, organizationId);
  await requireOrgAdmin(db, organizationId, userId);

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

async function handleCreate(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-write');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { db, userId } = await getUserScopedDb(request);
  const body = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { organizationId, email, role } = parsed.data;

  await requireTeamAdminAccess(db, userId, organizationId);
  await requireOrgAdmin(db, organizationId, userId);

  const { invitation, token } = await createInvitation(db, {
    organizationId,
    email,
    role,
    invitedByUserId: userId,
  });

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

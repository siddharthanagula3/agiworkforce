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
  formatInvitation,
  resendInvitation,
  revokeInvitation,
} from '@/lib/services/organization-invitation-service';
import { requireTeamAdminAccess } from '../../team-admin-access';

const UUID = z.string().uuid();

const ResendSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
  action: z.literal('resend'),
});

const RevokeQuerySchema = z.object({
  organizationId: z.string().uuid('organizationId must be a UUID'),
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
  if (!['owner', 'admin'].includes(membership.role)) {
    throw createError.forbidden('Only owners and admins can manage invitations');
  }
  return membership;
}

function parseInvitationId(raw: string): string {
  const parsed = UUID.safeParse(raw);
  if (!parsed.success) {
    throw createError.validation('invitationId must be a UUID');
  }
  return parsed.data;
}

async function handleResend(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-write');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const { invitationId: rawId } = await context.params;
  const invitationId = parseInvitationId(rawId);

  const body = await request.json().catch(() => ({}));
  const parsed = ResendSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const { organizationId } = parsed.data;

  const db = getNeonDb();
  await requireTeamAdminAccess(db, userId, organizationId);
  await requireOrgAdmin(db, organizationId, userId);

  const { invitation, token } = await resendInvitation(db, organizationId, invitationId);

  logger.info({ userId, organizationId, invitationId }, 'Organization invitation resent');

  return NextResponse.json({
    invitation: formatInvitation(invitation),
    inviteToken: token,
    delivery: {
      emailSent: false,
      reason:
        'No transactional email provider is configured. The previous link is now invalid; send this one instead.',
    },
  });
}

async function handleRevoke(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> },
) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-invitations-write');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const { invitationId: rawId } = await context.params;
  const invitationId = parseInvitationId(rawId);

  const { searchParams } = new URL(request.url);
  const parsed = RevokeQuerySchema.safeParse({
    organizationId: searchParams.get('organizationId') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('organizationId query parameter is required', parsed.error.issues);
  }
  const { organizationId } = parsed.data;

  const db = getNeonDb();
  await requireTeamAdminAccess(db, userId, organizationId);
  await requireOrgAdmin(db, organizationId, userId);

  const invitation = await revokeInvitation(db, organizationId, invitationId);

  logger.info({ userId, organizationId, invitationId }, 'Organization invitation revoked');

  await recordAuditEvent({
    userId,
    eventType: 'member_removed',
    request,
    organizationId,
    detail: {
      resourceType: 'organization_invitation',
      resourceId: invitationId,
      organizationId,
      reason: 'invitation_revoked',
    },
  });

  return NextResponse.json({ invitation: formatInvitation(invitation) });
}

export const POST = withErrorHandler(handleResend);
export const DELETE = withErrorHandler(handleRevoke);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

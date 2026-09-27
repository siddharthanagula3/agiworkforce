import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody, readValidatedSearchParams } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  auditSourceOf,
  auditSurfaceOf,
  requireCsrfUnlessWorkspaceApiKey,
  resolveWorkspaceApiCaller,
} from '@/lib/server/service-principals/caller';
import {
  createInvitation,
  expirePendingInvitations,
  formatInvitation,
  listInvitationPage,
} from '@/lib/services/organization-invitation-service';
import {
  assertKeyMayAssignRole,
  memberAdministrator,
} from '@/lib/services/organization-member-admin-service';
import { assertMembershipRoleWithinActor } from '@/app/api/settings/team/membership-role-ceiling';
import {
  readOrganizationName,
  sendInvitationEmail,
} from '@/app/api/settings/team/invitations/invitation-email';

export const runtime = 'nodejs';

const ROUTE = '/api/settings/organization/invitations';

const ListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    afterId: z.string().uuid().optional(),
  })
  .strict();

const CreateSchema = z
  .object({
    email: z.string().email().max(320),
    role: z.enum(['admin', 'member', 'viewer']).default('member'),
  })
  .strict();

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-team-invitations-list');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'GET');
  const query = readValidatedSearchParams(request, ListQuerySchema, 'Invalid invitation query');

  const db = getNeonDb();
  await expirePendingInvitations(db, caller.organizationId);
  const page = await listInvitationPage(db, caller.organizationId, {
    limit: query.limit,
    afterId: query.afterId ?? null,
  });
  const data = page.rows.map(formatInvitation);

  return NextResponse.json({
    data,
    hasMore: page.hasMore,
    firstId: data[0]?.id ?? null,
    lastId: data.at(-1)?.id ?? null,
  });
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfUnlessWorkspaceApiKey(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-team-invitations-write');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'POST');
  const { email, role } = await readValidatedJsonBody(request, CreateSchema, 'Invalid invitation');

  assertKeyMayAssignRole(memberAdministrator(caller), role);
  await assertMembershipRoleWithinActor({
    organizationId: caller.organizationId,
    actorUserId: caller.actorUserId,
    subject: email,
    actorPermissions: caller.permissions,
    role,
    request,
  });

  const { invitation, token } = await createInvitation(caller.db, {
    organizationId: caller.organizationId,
    email,
    role,
    invitedByUserId: caller.actorUserId,
  });

  const delivery = await sendInvitationEmail({
    to: invitation.email,
    token,
    role: invitation.role,
    organizationName: await readOrganizationName(caller.db, caller.organizationId),
    expiresAt: String(invitation.expires_at),
  });

  await recordAuditEvent({
    userId: caller.actorUserId,
    eventType: 'member_invited',
    request,
    organizationId: caller.organizationId,
    surface: auditSurfaceOf(caller),
    detail: {
      resourceType: 'organization_invitation',
      source: auditSourceOf(caller),
      resourceId: invitation.id,
      organizationId: caller.organizationId,
      role: invitation.role,
    },
  });

  return NextResponse.json(
    { invitation: formatInvitation(invitation), inviteToken: token, delivery },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

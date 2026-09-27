import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  auditSourceOf,
  auditSurfaceOf,
  requireCsrfUnlessWorkspaceApiKey,
  resolveWorkspaceApiCaller,
} from '@/lib/server/service-principals/caller';
import { formatInvitation, revokeInvitation } from '@/lib/services/organization-invitation-service';

export const runtime = 'nodejs';

const ROUTE = '/api/settings/organization/invitations/[invitationId]';

type RouteContext = { params: Promise<{ invitationId: string }> };

async function handleDelete(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfUnlessWorkspaceApiKey(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-team-invitations-write');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'DELETE');
  const { invitationId } = await context.params;
  const parsed = z.string().uuid().safeParse(invitationId);
  if (!parsed.success) {
    throw createError.validation('invitationId must be a UUID');
  }

  const invitation = await revokeInvitation(caller.db, caller.organizationId, parsed.data);

  await recordAuditEvent({
    userId: caller.actorUserId,
    eventType: 'member_removed',
    request,
    organizationId: caller.organizationId,
    surface: auditSurfaceOf(caller),
    detail: {
      resourceType: 'organization_invitation',
      source: auditSourceOf(caller),
      resourceId: invitation.id,
      organizationId: caller.organizationId,
      reason: 'invitation_revoked',
    },
  });

  return NextResponse.json(formatInvitation(invitation));
}

export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

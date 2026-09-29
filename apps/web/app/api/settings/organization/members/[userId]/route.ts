import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getIdentityProvider } from '@/lib/server/identity';
import { getNeonDb } from '@/lib/server/neon-db';
import { invalidateActiveOrganizationCache } from '@/lib/server/request-context-cache';
import {
  auditSourceOf,
  auditSurfaceOf,
  requireCsrfUnlessWorkspaceApiKey,
  resolveWorkspaceApiCaller,
} from '@/lib/server/service-principals/caller';
import { deprovisionMember } from '@/lib/services/deprovision-service';
import {
  changeMemberRole,
  memberAdministrator,
  readWorkspaceMember,
  removeMember,
  roleGrantsAdministration,
  type WorkspaceMember,
} from '@/lib/services/organization-member-admin-service';

export const runtime = 'nodejs';

const ROUTE = '/api/settings/organization/members/[userId]';

const PatchSchema = z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) }).strict();

type RouteContext = { params: Promise<{ userId: string }> };

async function readTargetUserId(context: RouteContext): Promise<string> {
  // Next has already decoded the segment; decoding again breaks an id containing %.
  const { userId } = await context.params;
  const decoded = userId.trim();
  if (!decoded || decoded.length > 255) {
    throw createError.validation('userId is required');
  }
  return decoded;
}

async function requireWorkspaceMember(
  organizationId: string,
  userId: string,
): Promise<WorkspaceMember> {
  const member = await readWorkspaceMember(getNeonDb(), organizationId, userId);
  if (!member) {
    throw createError.notFound('No member with that id in this workspace.');
  }
  return member;
}

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'settings-team-list');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'GET');
  const userId = await readTargetUserId(context);
  return NextResponse.json(await requireWorkspaceMember(caller.organizationId, userId));
}

async function handlePatch(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfUnlessWorkspaceApiKey(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-team-patch');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'PATCH');
  const targetUserId = await readTargetUserId(context);
  const { role } = await readValidatedJsonBody(request, PatchSchema, 'Invalid member role');

  const previousRole = await changeMemberRole(caller.db, {
    organizationId: caller.organizationId,
    administrator: memberAdministrator(caller),
    targetUserId,
    role,
    request,
  });

  await invalidateActiveOrganizationCache(targetUserId);

  await recordAuditEvent({
    userId: caller.actorUserId,
    eventType: 'member_role_changed',
    request,
    organizationId: caller.organizationId,
    surface: auditSurfaceOf(caller),
    severity: roleGrantsAdministration(role) ? 'warning' : 'info',
    detail: {
      resourceType: 'organization_member',
      source: auditSourceOf(caller),
      resourceId: targetUserId,
      organizationId: caller.organizationId,
      targetUserId,
      previousRole,
      role,
    },
  });

  return NextResponse.json(await requireWorkspaceMember(caller.organizationId, targetUserId));
}

async function handleDelete(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse | Response> {
  const csrfError = await requireCsrfUnlessWorkspaceApiKey(request);
  if (csrfError) return csrfError;
  const limited = await withRateLimit(request, 'settings-team-delete');
  if (limited) return limited;

  const caller = await resolveWorkspaceApiCaller(request, ROUTE, 'DELETE');
  const targetUserId = await readTargetUserId(context);

  const previousRole = await removeMember(caller.db, {
    organizationId: caller.organizationId,
    administrator: memberAdministrator(caller),
    targetUserId,
  });

  await invalidateActiveOrganizationCache(targetUserId);

  const deprovision = await deprovisionMember(getNeonDb(), getIdentityProvider(), {
    userId: targetUserId,
    organizationId: caller.organizationId,
  });

  await recordAuditEvent({
    userId: caller.actorUserId,
    eventType: 'member_removed',
    request,
    organizationId: caller.organizationId,
    surface: auditSurfaceOf(caller),
    outcome: deprovision.errors.length > 0 ? 'failure' : 'success',
    severity: deprovision.errors.length > 0 ? 'critical' : 'warning',
    detail: {
      resourceType: 'organization_member',
      source: auditSourceOf(caller),
      resourceId: targetUserId,
      organizationId: caller.organizationId,
      targetUserId,
      previousRole,
      count: deprovision.sessionsRevoked,
      reason: deprovision.errors.length > 0 ? deprovision.errors.join('; ') : undefined,
    },
  });

  return NextResponse.json({
    userId: targetUserId,
    removed: true,
    previousRole,
    revoked: {
      sessions: deprovision.sessionsRevoked,
      deviceTokens: deprovision.deviceTokensRevoked,
      apiKeys: deprovision.apiKeysRevoked,
    },
    warnings: deprovision.errors,
  });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

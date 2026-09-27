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
import { handleCorsPreflightRequest } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import { deprovisionMember } from '@/lib/services/deprovision-service';
import { changeMemberRole, removeMember } from '@/lib/services/organization-member-admin-service';
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

  const removedRole = await removeMember(db, {
    organizationId,
    administrator: { kind: 'member', userId: requesterId },
    targetUserId,
  });

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

  const previousRole = await changeMemberRole(db, {
    organizationId,
    administrator: { kind: 'member', userId: requesterId },
    targetUserId,
    role: newRole,
    request,
  });

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

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { logger } from '@/lib/logger';
import { recordAuditEvent } from '@/lib/security-audit';
import { leaveOrganization } from '@/lib/services/organization-membership-service';
import { z } from 'zod';
import { createError } from '@/lib/errors';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

const LeaveSchema = z.object({
  successorUserId: z.string().trim().min(1).max(255).optional(),
});

async function handleLeave(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-team-delete');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const parsed = LeaveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }
  const db = getNeonDb();
  const organizationId = await resolveActiveOrganizationId(db, userId);
  if (!organizationId) {
    throw createError.notFound('Select a workspace before leaving it');
  }
  const result = await leaveOrganization(db, {
    userId,
    organizationId,
    ...(parsed.data.successorUserId ? { successorUserId: parsed.data.successorUserId } : {}),
  });

  logger.info(
    { userId, organizationId: result.organizationId, previousRole: result.previousRole },
    'User left organization',
  );

  await recordAuditEvent({
    userId,
    eventType: 'member_removed',
    request,
    organizationId: result.organizationId,
    detail: {
      resourceType: 'organization_member',
      resourceId: userId,
      organizationId: result.organizationId,
      targetUserId: userId,
      previousRole: result.previousRole,
      reason: 'self_leave',
      ...(result.successorUserId ? { successorUserId: result.successorUserId } : {}),
    },
  });

  if (result.successorUserId && result.successorPreviousRole) {
    await recordAuditEvent({
      userId,
      eventType: 'member_role_changed',
      request,
      organizationId: result.organizationId,
      severity: 'warning',
      detail: {
        resourceType: 'organization_member',
        resourceId: result.successorUserId,
        organizationId: result.organizationId,
        targetUserId: result.successorUserId,
        previousRole: result.successorPreviousRole,
        role: 'owner',
        reason: 'ownership_transferred_on_self_leave',
      },
    });
  }

  return NextResponse.json({ message: 'You left the workspace' });
}

export const DELETE = withErrorHandler(handleLeave);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

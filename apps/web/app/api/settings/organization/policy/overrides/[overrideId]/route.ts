import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { deletePolicyOverride } from '@/lib/services/organization-policy-override-service';
import { requireWorkspaceConsolePermission } from '../../../workspace-access';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';

async function handleDelete(
  request: NextRequest,
  context: { params: Promise<{ overrideId: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { overrideId } = await context.params;
  if (!isUuid(overrideId)) throw createError.validation('overrideId must be a uuid');

  const { db, userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    'Your workspace role does not allow changing workspace policy.',
  );

  const removed = await deletePolicyOverride(db, organizationId, overrideId);
  if (!removed) {
    throw createError.notFound('That policy exception does not exist.').asUserSafe();
  }

  await recordAuditEvent({
    userId,
    eventType: 'admin_policy_changed',
    organizationId,
    request,
    severity: 'warning',
    detail: {
      resourceType: 'organization_policy_override',
      resourceId: overrideId,
      status: 'deleted',
      role: access.role,
    },
  });

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandler(handleDelete);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

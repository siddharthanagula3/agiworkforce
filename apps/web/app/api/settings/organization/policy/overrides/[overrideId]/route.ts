import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { deletePolicyOverride } from '@/lib/services/organization-policy-override-service';
import { requireWorkspaceConsolePermission } from '../../../workspace-access';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handleDelete(
  request: NextRequest,
  context: { params: Promise<{ overrideId: string }> },
) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const { overrideId } = await context.params;
  if (!UUID_RE.test(overrideId)) throw createError.validation('overrideId must be a uuid');

  const { userId, organizationId, access } = await requireWorkspaceConsolePermission(
    request,
    'policy.manage',
    'Your workspace role does not allow changing workspace policy.',
  );

  const removed = await deletePolicyOverride(getNeonDb(), organizationId, overrideId);
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

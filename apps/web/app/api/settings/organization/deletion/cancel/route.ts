import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { requireOrganizationOwner } from '@/lib/services/organization-membership-service';
import { isMissingOrganizationDeletionColumns } from '@/lib/server/organization-deletion';

async function handleCancel(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-delete-cancel');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const activeOrganizationId = await resolveActiveOrganizationId(db, userId);
  if (!activeOrganizationId) {
    throw createError.notFound('Select a workspace before cancelling its deletion');
  }

  await requireOrganizationOwner(db, userId, activeOrganizationId, 'cancel its deletion');

  let cancelled: Array<{ id: string }> = [];
  try {
    cancelled = await db.query<{ id: string }>(
      `update public.organizations
          set deletion_requested_at = null,
              deletion_scheduled_for = null,
              deletion_requested_by = null
        where id = $1
          and deletion_scheduled_for is not null
          and deletion_scheduled_for > now()
        returning id`,
      [activeOrganizationId],
    );
  } catch (error) {
    if (!isMissingOrganizationDeletionColumns(error)) throw error;
    return NextResponse.json({ message: 'No workspace deletion is pending.', cancelled: false });
  }

  if (cancelled.length > 0) {
    logger.info(
      { userId, orgId: activeOrganizationId },
      'Workspace deletion cancelled inside the grace window',
    );

    await recordAuditEvent({
      userId,
      eventType: 'organization_deletion_cancelled',
      request,
      organizationId: activeOrganizationId,
      detail: {
        resourceType: 'organization',
        resourceId: activeOrganizationId,
        status: 'cancelled',
      },
    });

    return NextResponse.json({
      message: 'Workspace deletion cancelled. The workspace is fully restored.',
      cancelled: true,
    });
  }

  const [org] = await db.query<{ deletion_scheduled_for: string | null }>(
    `select deletion_scheduled_for from public.organizations where id = $1`,
    [activeOrganizationId],
  );
  const scheduledFor = org?.deletion_scheduled_for ?? null;

  if (scheduledFor === null) {
    return NextResponse.json({ message: 'No workspace deletion is pending.', cancelled: false });
  }

  logger.warn(
    { userId, orgId: activeOrganizationId },
    'Workspace deletion cancellation refused: grace window has closed',
  );
  throw createError.conflict(
    'The cancellation window has closed and erasure is already underway. Nothing was restored.',
  );
}

export const POST = withErrorHandler(handleCancel);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

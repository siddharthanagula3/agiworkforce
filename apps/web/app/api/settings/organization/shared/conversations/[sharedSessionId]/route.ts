import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgMember, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { unshareSessionFromOrganization } from '@/lib/services/org-shared-session-service';
import { recordAuditEvent } from '@/lib/security-audit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSharedSessionId(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw createError.validation('sharedSessionId must be a uuid');
  }
  return raw;
}

/**
 * Stop sharing one conversation with the workspace.
 *
 * Membership is the gate the route checks; which members may actually delete
 * the grant row is decided by 0186's policy, which admits the share's owner and
 * an org admin. Visibility is deliberately NOT reset to `public` here: an
 * un-share is somebody withdrawing access, and answering it by reopening the
 * public link would widen exposure at the exact moment the caller asked to
 * narrow it. The transcript stays its owner's alone until they choose an
 * audience again from the share dialog.
 */
async function handleUnshare(
  request: NextRequest,
  context: { params: Promise<{ sharedSessionId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { sharedSessionId } = await context.params;
  const sessionId = parseSharedSessionId(sharedSessionId);

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgMember(await resolveOrgMembership(db, userId));

  const removed = await unshareSessionFromOrganization(db, membership.organizationId, sessionId);
  if (!removed) {
    throw createError.notFound('That conversation is not shared with your organization');
  }

  await recordAuditEvent({
    userId,
    organizationId: membership.organizationId,
    eventType: 'organization_share_revoked',
    request,
    detail: { resourceType: 'conversation', resourceId: sessionId },
  });

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandler(handleUnshare);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

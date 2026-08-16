import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireOrgAdmin, resolveOrgMembership } from '@/lib/services/org-sharing-service';
import { shareConnector, unshareConnector } from '@/lib/services/org-shared-connector-service';
import { evictOrgSharedConnectorCaches } from '@/lib/user-connector-tools';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseConnectorId(raw: string): string {
  if (!UUID_RE.test(raw)) {
    throw createError.validation('connectorId must be a uuid');
  }
  return raw;
}

async function handleShare(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { connectorId } = await context.params;
  const parsedConnectorId = parseConnectorId(connectorId);

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgAdmin(await resolveOrgMembership(db, userId));

  const shared = await shareConnector(db, {
    organizationId: membership.organizationId,
    connectorRowId: parsedConnectorId,
    actorUserId: userId,
  });

  return NextResponse.json({ sharedConnector: shared });
}

async function handleUnshare(
  request: NextRequest,
  context: { params: Promise<{ connectorId: string }> },
): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'settings-org-patch');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const { connectorId } = await context.params;
  const parsedConnectorId = parseConnectorId(connectorId);

  const { db, userId } = await getUserScopedDb(request);
  const membership = requireOrgAdmin(await resolveOrgMembership(db, userId));

  const removed = await unshareConnector(db, membership.organizationId, parsedConnectorId);
  if (!removed) {
    throw createError.notFound('That connector is not shared with your organization');
  }

  await evictOrgSharedConnectorCaches(membership.organizationId, parsedConnectorId);

  return NextResponse.json({ success: true });
}

export const PUT = withErrorHandler(handleShare);
export const DELETE = withErrorHandler(handleUnshare);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

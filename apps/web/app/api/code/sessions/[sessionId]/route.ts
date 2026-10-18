import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  deleteCloudCodeSession,
  getCloudCodeSession,
  listCloudCodeAgentTurns,
  listCloudCodeTerminalEntries,
  renameCloudCodeSession,
  setCloudCodeSessionArchived,
} from '@/lib/services/cloud-code-session-service';
import {
  CloudCodeSharingForbiddenError,
  setCloudCodeSessionSharing,
} from '@/lib/services/cloud-code-session-sharing';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { CLOUD_CODE_SHARE_VISIBILITIES, isCloudCodeShareVisibility } from '@agiworkforce/types';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowRouteError(error: unknown): never {
  if (error instanceof CloudCodeSharingForbiddenError) throw createError.forbidden(error.message);
  rethrowCloudCodeError(error);
}

async function requestObject(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError.validation('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

async function handleGet(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation-read', `user:${userId}`);
  if (limited) return limited;
  const { sessionId } = await context.params;
  const owner = { userId, organizationId };
  try {
    const [session, terminalEntries, turns] = await Promise.all([
      getCloudCodeSession(db, owner, sessionId),
      listCloudCodeTerminalEntries(db, owner, sessionId),
      listCloudCodeAgentTurns(db, owner, sessionId),
    ]);
    return NextResponse.json({ session, terminalEntries, turns });
  } catch (error) {
    rethrowRouteError(error);
  }
}

async function handlePatch(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const body = await requestObject(request);
  const { sessionId } = await context.params;
  const owner = { userId, organizationId };
  const hasTitle = body['title'] !== undefined;
  const hasArchived = body['archived'] !== undefined;
  const shareVisibility = body['shareVisibility'];
  const hasShare = shareVisibility !== undefined;
  if (!hasTitle && !hasArchived && !hasShare) {
    throw createError.validation(
      'Send a "title" to rename, "archived" to archive or unarchive, or "shareVisibility" to share',
    );
  }
  if (hasArchived && typeof body['archived'] !== 'boolean') {
    throw createError.validation('"archived" must be true or false');
  }
  if (hasShare && !isCloudCodeShareVisibility(shareVisibility)) {
    throw createError.validation(
      `"shareVisibility" must be one of ${CLOUD_CODE_SHARE_VISIBILITIES.join(', ')}`,
    );
  }

  try {
    let session = hasTitle
      ? await renameCloudCodeSession(db, owner, sessionId, body['title'])
      : await getCloudCodeSession(db, owner, sessionId);
    if (hasArchived) {
      session = await setCloudCodeSessionArchived(db, owner, sessionId, body['archived'] === true);
    }
    if (hasShare && isCloudCodeShareVisibility(shareVisibility)) {
      session = await setCloudCodeSessionSharing(db, owner, sessionId, shareVisibility);
    }
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: {
        resourceType: 'code_session',
        resourceId: sessionId,
        status: hasShare
          ? shareVisibility === 'private'
            ? 'unshared'
            : `shared_${String(shareVisibility)}`
          : hasArchived
            ? body['archived'] === true
              ? 'archived'
              : 'active'
            : 'renamed',
        changedKeys: [
          hasTitle ? 'title' : null,
          hasArchived ? 'archived' : null,
          hasShare ? 'shareVisibility' : null,
        ].filter((key): key is string => key !== null),
      },
    });
    return NextResponse.json({ session });
  } catch (error) {
    rethrowRouteError(error);
  }
}

async function handleDelete(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const { sessionId } = await context.params;
  const planTier = await resolveEntitledPlanTier(db, userId);
  try {
    await deleteCloudCodeSession(db, { userId, organizationId }, sessionId, planTier);
    await recordAuditEvent({
      userId,
      organizationId,
      request,
      eventType: 'code_session_lifecycle_changed',
      detail: { resourceType: 'code_session', resourceId: sessionId, status: 'deleted' },
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    rethrowRouteError(error);
  }
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);

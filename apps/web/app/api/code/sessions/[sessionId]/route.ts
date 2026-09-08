import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { effectivePlanTier } from '@agiworkforce/types';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeUnavailableError,
  CloudCodeValidationError,
  deleteCloudCodeSession,
  getCloudCodeSession,
  isCloudCodeSchemaUnavailable,
  listCloudCodeAgentTurns,
  listCloudCodeTerminalEntries,
  renameCloudCodeSession,
  setCloudCodeSessionArchived,
} from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (error instanceof CloudCodeUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.serviceUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
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
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
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
    rethrowCloudCodeError(error);
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
  if (!hasTitle && !hasArchived) {
    throw createError.validation('Send a "title" to rename, or "archived" to archive or unarchive');
  }
  if (hasArchived && typeof body['archived'] !== 'boolean') {
    throw createError.validation('"archived" must be true or false');
  }

  try {
    let session = hasTitle
      ? await renameCloudCodeSession(db, owner, sessionId, body['title'])
      : await getCloudCodeSession(db, owner, sessionId);
    if (hasArchived) {
      session = await setCloudCodeSessionArchived(db, owner, sessionId, body['archived'] === true);
    }
    return NextResponse.json({ session });
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

async function handleDelete(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const { sessionId } = await context.params;
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);
  try {
    await deleteCloudCodeSession(db, { userId, organizationId }, sessionId, planTier);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);

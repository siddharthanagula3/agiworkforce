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
  closeCloudCodeSession,
  getCloudCodeSession,
  isCloudCodeSchemaUnavailable,
  listCloudCodeAgentTurns,
  listCloudCodeTerminalEntries,
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
    return NextResponse.json({
      session: await closeCloudCodeSession(db, { userId, organizationId }, sessionId, planTier),
    });
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const GET = withErrorHandler(handleGet);
export const DELETE = withErrorHandler(handleDelete);

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { requestCloudCodeTurnCancellation } from '@/lib/services/cloud-code-agent-service';
import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeValidationError,
  isCloudCodeSchemaUnavailable,
} from '@/lib/services/cloud-code-session-service';

export const runtime = 'nodejs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ sessionId: string }> };

function rethrowCloudCodeError(error: unknown): never {
  if (error instanceof CloudCodeValidationError) throw createError.validation(error.message);
  if (error instanceof CloudCodeNotFoundError) throw createError.notFound(error.message);
  if (error instanceof CloudCodeConflictError) throw createError.conflict(error.message);
  if (isCloudCodeSchemaUnavailable(error)) {
    throw createError.capabilityUnavailable(
      'Managed Code is coming soon. Cloud sessions are not available yet.',
    );
  }
  throw error;
}

async function optionalTurnId(request: NextRequest): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const turnId = (body as Record<string, unknown>)['turnId'];
  if (turnId === undefined || turnId === null) return null;
  if (typeof turnId !== 'string' || !UUID_PATTERN.test(turnId)) {
    throw createError.validation('"turnId" must be a turn identifier');
  }
  return turnId;
}

async function handleCancel(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const turnId = await optionalTurnId(request);
  const { sessionId } = await context.params;
  try {
    return NextResponse.json(
      await requestCloudCodeTurnCancellation(db, { userId, organizationId }, sessionId, turnId),
    );
  } catch (error) {
    rethrowCloudCodeError(error);
  }
}

export const POST = withErrorHandler(handleCancel);

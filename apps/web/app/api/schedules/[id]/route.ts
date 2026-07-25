import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ScheduleConflictError,
  ScheduleNotFoundError,
  ScheduleValidationError,
  deleteSchedule,
  getSchedule,
  setScheduleEnabled,
  updateSchedule,
  type ScheduleUpdateInput,
} from '@/lib/services/schedule-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

function rethrowScheduleError(error: unknown): never {
  if (error instanceof ScheduleValidationError) throw createError.validation(error.message);
  if (error instanceof ScheduleNotFoundError) throw createError.notFound('Schedule not found');
  if (error instanceof ScheduleConflictError) throw createError.conflict(error.message);
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

async function authorizeMutation(request: NextRequest) {
  const scoped = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, scoped.userId);
  return { ...scoped, csrfError };
}

async function handleGetSchedule(request: NextRequest, context: RouteContext) {
  // GOV-16: authenticate first so the bucket is `user:<id>`, not the shared IP.
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  const { id } = await context.params;
  try {
    return NextResponse.json({ schedule: await getSchedule(db, userId, id) });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

async function handleUpdateSchedule(request: NextRequest, context: RouteContext) {
  // GOV-16: user-keyed rate limit (authenticate before bucketing).
  const { db, userId, csrfError } = await authorizeMutation(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  if (csrfError) return csrfError as NextResponse;
  const { id } = await context.params;
  const body = await requestObject(request);
  try {
    return NextResponse.json({
      schedule: await updateSchedule(db, userId, id, body as ScheduleUpdateInput),
    });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

async function handleDeleteSchedule(request: NextRequest, context: RouteContext) {
  // GOV-16: user-keyed rate limit (authenticate before bucketing).
  const { db, userId, csrfError } = await authorizeMutation(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  if (csrfError) return csrfError as NextResponse;
  const { id } = await context.params;
  try {
    await deleteSchedule(db, userId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

async function handleToggleSchedule(request: NextRequest, context: RouteContext) {
  // GOV-16: user-keyed rate limit (authenticate before bucketing).
  const { db, userId, csrfError } = await authorizeMutation(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  if (csrfError) return csrfError as NextResponse;
  const { id } = await context.params;
  const body = await requestObject(request);
  if (typeof body['isActive'] !== 'boolean') {
    throw createError.validation('isActive must be a boolean');
  }
  try {
    return NextResponse.json({
      schedule: await setScheduleEnabled(db, userId, id, body['isActive']),
    });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const GET = withErrorHandler(handleGetSchedule);
export const PUT = withErrorHandler(handleUpdateSchedule);
export const DELETE = withErrorHandler(handleDeleteSchedule);
export const PATCH = withErrorHandler(handleToggleSchedule);

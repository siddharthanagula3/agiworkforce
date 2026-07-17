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
  createSchedule,
  listSchedules,
  type ScheduleInput,
} from '@/lib/services/schedule-service';

export const runtime = 'nodejs';

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

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

async function handleGetSchedules(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, integerQueryValue(url.searchParams.get('limit'), 50)));
  const offset = Math.min(
    10_000,
    Math.max(0, integerQueryValue(url.searchParams.get('offset'), 0)),
  );
  const schedules = await listSchedules(db, userId, { limit, offset });
  return NextResponse.json({ schedules, pagination: { limit, offset } });
}

async function handleCreateSchedule(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const body = await requestObject(request);

  try {
    const schedule = await createSchedule(db, userId, body as unknown as ScheduleInput);
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const GET = withErrorHandler(handleGetSchedules);
export const POST = withErrorHandler(handleCreateSchedule);

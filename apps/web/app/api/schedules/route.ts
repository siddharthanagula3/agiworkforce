import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ScheduleConflictError,
  ScheduleLimitError,
  ScheduleNotFoundError,
  ScheduleValidationError,
  assertScheduleQuota,
  createSchedule,
  listSchedules,
  type ScheduleInput,
} from '@/lib/services/schedule-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import {
  MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  clampSchedulePageOffset,
  clampSchedulePageSize,
} from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

function rethrowScheduleError(error: unknown): never {
  if (error instanceof ScheduleLimitError) throw createError.forbidden(error.message);
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
  const { db, userId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const limit = clampSchedulePageSize(
    integerQueryValue(url.searchParams.get('limit'), MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE),
    MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
    MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  );
  const offset = clampSchedulePageOffset(integerQueryValue(url.searchParams.get('offset'), 0));
  const projectId = url.searchParams.get('projectId');
  const schedules = await listSchedules(db, userId, { limit, offset, projectId });
  return NextResponse.json({ schedules, pagination: { limit, offset } });
}

async function handleCreateSchedule(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const body = await requestObject(request);

  try {
    const subscription = await SubscriptionService.getSubscription(db, userId);
    const schedule = await db.transaction(async (tx) => {
      await tx.execute('select pg_advisory_xact_lock(hashtext($1))', [`scheduled_tasks:${userId}`]);
      await assertScheduleQuota(tx, userId, subscription?.plan_tier);
      return createSchedule(tx, userId, body as unknown as ScheduleInput);
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const GET = withErrorHandler(handleGetSchedules);
export const POST = withErrorHandler(handleCreateSchedule);

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  buildWorkspaceAccessGateResponse,
  buildWorkspaceFeatureGateResponse,
} from '@/lib/managed-compute-gate';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { AppError, ErrorCode, createError } from '@/lib/errors';
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
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  MANAGED_CLOUD_SCHEDULES_DEFAULT_PAGE_SIZE,
  MANAGED_CLOUD_SCHEDULES_MAX_PAGE_SIZE,
  clampSchedulePageOffset,
  clampSchedulePageSize,
} from '@agiworkforce/cloud-contracts';
import { getNextUpgradeTier, getPlanMaxScheduledTasks } from '@agiworkforce/types';
import { UPGRADE_HREF } from '@/lib/services/managed-usage-request-service';

export const runtime = 'nodejs';

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

const SCHEDULES_NOT_IN_PLAN_CODE = 'schedules_not_in_plan';
const SCHEDULE_LIMIT_REACHED_CODE = 'schedule_limit_reached';

function scheduleLimitRefusal(error: ScheduleLimitError): AppError {
  return new AppError(ErrorCode.SUBSCRIPTION_REQUIRED, error.message, 403, {
    code: error.limit === 0 ? SCHEDULES_NOT_IN_PLAN_CODE : SCHEDULE_LIMIT_REACHED_CODE,
    limit: error.limit,
    ...(getNextUpgradeTier(error.planTier) === null
      ? {}
      : { recovery: { action: 'upgrade', href: UPGRADE_HREF } }),
  }).asUserSafe();
}

function rethrowScheduleError(error: unknown): never {
  if (error instanceof ScheduleLimitError) throw scheduleLimitRefusal(error);
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
  const { db, userId, surface } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const accessGate = await buildWorkspaceAccessGateResponse(userId, request, surface ?? 'unknown');
  if (accessGate) return accessGate;

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
  const { db, userId, surface } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const planTier = await resolveEntitledPlanTier(db, userId);
  try {
    if (getPlanMaxScheduledTasks(planTier) === 0) {
      await assertScheduleQuota(db, userId, planTier);
    }
  } catch (error) {
    rethrowScheduleError(error);
  }

  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'schedules',
    surface ?? 'unknown',
  );
  if (featureGate) return featureGate;
  const body = await requestObject(request);

  try {
    const schedule = await db.transaction(async (tx) => {
      await tx.execute('select pg_advisory_xact_lock(hashtext($1))', [`scheduled_tasks:${userId}`]);
      await assertScheduleQuota(tx, userId, planTier);
      return createSchedule(tx, userId, body as unknown as ScheduleInput, {
        planTier,
      });
    });
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const GET = withErrorHandler(handleGetSchedules);
export const POST = withErrorHandler(handleCreateSchedule);

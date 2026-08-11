import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getNeonDb } from '@/lib/server/neon-db';
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

export const runtime = 'nodejs';

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
}

function rethrowScheduleError(error: unknown): never {
  // GOV-8: a plan ceiling is an entitlement refusal, not a malformed request.
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
  // GOV-16: resolve the authenticated principal FIRST so the limit is keyed per
  // user. Previously no identifier was passed, so this bucket fell back to the
  // caller's IP and every user behind one NAT/office egress shared 60/min.
  const { db, userId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

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
  // GOV-16: user-keyed, not IP-keyed (see handleGetSchedules).
  const { db, userId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const body = await requestObject(request);

  try {
    // GOV-8: every firing of a schedule runs an unattended managed turn through
    // `reserveManagedUsageRequest`. A rate limit bounds how fast schedules can
    // be CREATED; only this plan ceiling bounds how many can exist and fire.
    const subscription = await SubscriptionService.getSubscription(db, userId);
    // Plan ceilings are per account, not per active workspace. The request DB
    // intentionally sees only Personal or one Team scope, so use a privileged
    // count with an explicit owner predicate before the RLS-scoped insert.
    await assertScheduleQuota(getNeonDb(), userId, subscription?.plan_tier);

    const schedule = await createSchedule(db, userId, body as unknown as ScheduleInput);
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const GET = withErrorHandler(handleGetSchedules);
export const POST = withErrorHandler(handleCreateSchedule);

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
  createManualScheduleRun,
  listScheduleRuns,
  processClaimedScheduleRun,
} from '@/lib/services/schedule-service';
import { executeScheduledAgent } from '@/lib/services/scheduled-agent-executor';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

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

async function handleGetRuns(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const { id: taskId } = await context.params;
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, integerQueryValue(url.searchParams.get('limit'), 20)));
  const offset = Math.min(
    10_000,
    Math.max(0, integerQueryValue(url.searchParams.get('offset'), 0)),
  );

  try {
    const runs = await listScheduleRuns(db, userId, taskId, { limit, offset });
    return NextResponse.json({ runs, pagination: { limit, offset } });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

async function handleTriggerRun(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!idempotencyKey) {
    throw createError.validation('Idempotency-Key header is required');
  }
  const { id: taskId } = await context.params;

  try {
    const manual = await createManualScheduleRun(db, {
      userId,
      taskId,
      idempotencyKey,
      leaseSeconds: 45,
    });
    if (manual.replay) {
      if (manual.run.status === 'running') {
        throw new ScheduleConflictError('This manual run is already in progress');
      }
      return NextResponse.json({ run: manual.run, replay: true });
    }

    const run = await processClaimedScheduleRun(db, manual.claim, executeScheduledAgent, {
      timeoutMs: 40_000,
      signal: request.signal,
    });
    return NextResponse.json({ run, replay: false }, { status: 201 });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const GET = withErrorHandler(handleGetRuns);
export const POST = withErrorHandler(handleTriggerRun);

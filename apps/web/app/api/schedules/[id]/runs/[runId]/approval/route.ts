import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { ManagedCloudScheduleRunApprovalSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  ScheduleConflictError,
  ScheduleNotFoundError,
  ScheduleValidationError,
  claimScheduleRunApproval,
  processClaimedScheduleRun,
} from '@/lib/services/schedule-service';
import { executeScheduledAgent } from '@/lib/services/scheduled-agent-executor';

export const runtime = 'nodejs';
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string; runId: string }> };

function rethrowScheduleError(error: unknown): never {
  if (error instanceof ScheduleValidationError) throw createError.validation(error.message);
  if (error instanceof ScheduleNotFoundError) throw createError.notFound(error.message);
  if (error instanceof ScheduleConflictError) throw createError.conflict(error.message);
  throw error;
}

async function handleResolveApproval(request: NextRequest, context: RouteContext) {
  const { db, userId } = await getUserScopedDb(request);

  const rateLimitResponse = await withRateLimit(request, 'llm-completion', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const parsed = ManagedCloudScheduleRunApprovalSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('An approval needs a decision and the tool calls it answers');
  }
  const { id: taskId, runId } = await context.params;

  try {
    const { claim, resume } = await claimScheduleRunApproval(db, {
      userId,
      taskId,
      runId,
      approval: parsed.data,
      leaseSeconds: 45,
    });
    const run = await processClaimedScheduleRun(db, claim, executeScheduledAgent, {
      timeoutMs: 40_000,
      resume,
    });
    return NextResponse.json({ run });
  } catch (error) {
    rethrowScheduleError(error);
  }
}

export const POST = withErrorHandler(handleResolveApproval);

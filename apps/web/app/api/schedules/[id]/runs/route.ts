/**
 * Schedule Runs API
 *
 * GET /api/schedules/[id]/runs - List runs for a schedule
 * POST /api/schedules/[id]/runs - Trigger an immediate run
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

function mapRowToRun(row: Record<string, unknown>) {
  return {
    id: row['id'],
    scheduleId: row['schedule_id'],
    status: row['status'],
    startedAt: row['started_at'],
    completedAt: row['completed_at'] ?? null,
    result: row['result'] ?? null,
    error: row['error'] ?? null,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/schedules/[id]/runs
// ---------------------------------------------------------------------------

async function handleGetRuns(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: scheduleId } = await context.params;

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 100);

  // Verify the schedule belongs to this user
  const [schedule] = await db.query<{ id: string }>(
    `select id from scheduled_tasks where id = $1 and user_id = $2 limit 1`,
    [scheduleId, userId],
  );

  if (!schedule) {
    throw createError.notFound('Schedule not found');
  }

  // Fetch runs
  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select * from schedule_runs
       where schedule_id = $1 and user_id = $2
       order by started_at desc
       limit $3`,
      [scheduleId, userId, limit],
    );
  } catch (error) {
    logger.error({ error, scheduleId }, 'Failed to fetch schedule runs');
    throw createError.internal('Failed to fetch schedule runs');
  }

  return NextResponse.json({
    runs: data.map(mapRowToRun),
  });
}

// ---------------------------------------------------------------------------
// POST /api/schedules/[id]/runs (trigger immediate run)
// ---------------------------------------------------------------------------

async function handleTriggerRun(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id: scheduleId } = await context.params;

  // Verify the schedule belongs to this user
  const [schedule] = await db.query<{ id: string }>(
    `select id from scheduled_tasks where id = $1 and user_id = $2 limit 1`,
    [scheduleId, userId],
  );

  if (!schedule) {
    throw createError.notFound('Schedule not found');
  }

  // Create a pending run
  let runData: Record<string, unknown>;
  try {
    const [inserted] = await db.query<Record<string, unknown>>(
      `insert into schedule_runs (schedule_id, user_id, status)
       values ($1, $2, 'pending')
       returning *`,
      [scheduleId, userId],
    );
    if (!inserted) throw new Error('No row returned');
    runData = inserted;
  } catch (error) {
    logger.error({ error, scheduleId }, 'Failed to trigger schedule run');
    throw createError.internal('Failed to trigger schedule run');
  }

  // Update the schedule's last_run_at (best-effort, do not fail the request)
  try {
    await db.execute(
      `update scheduled_tasks
       set last_run_at = now(), last_run_status = 'pending'
       where id = $1 and user_id = $2`,
      [scheduleId, userId],
    );
  } catch {
    // non-fatal
  }

  return NextResponse.json({ run: mapRowToRun(runData) }, { status: 201 });
}

export const GET = withErrorHandler(handleGetRuns);
export const POST = withErrorHandler(handleTriggerRun);

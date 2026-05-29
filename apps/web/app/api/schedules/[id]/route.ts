/**
 * Single Schedule API
 *
 * GET /api/schedules/[id] - Get a single schedule
 * PUT /api/schedules/[id] - Update a schedule
 * DELETE /api/schedules/[id] - Delete a schedule
 * PATCH /api/schedules/[id] - Toggle active status
 */

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

function mapRowToSchedule(row: Record<string, unknown>) {
  return {
    id: row['id'],
    name: row['name'],
    prompt: row['prompt'],
    model: row['model'],
    recurrence: row['recurrence'],
    cronExpression: row['cron_expression'] ?? null,
    scheduledAt: row['scheduled_at'] ?? null,
    daysOfWeek: row['days_of_week'] ?? null,
    dayOfMonth: row['day_of_month'] ?? null,
    timeOfDay: row['time_of_day'],
    timezone: row['timezone'],
    isActive: row['is_active'],
    lastRunAt: row['last_run_at'] ?? null,
    nextRunAt: row['next_run_at'] ?? null,
    lastRunStatus: row['last_run_status'] ?? null,
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/schedules/[id]
// ---------------------------------------------------------------------------

async function handleGetSchedule(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  const [data] = await db.query<Record<string, unknown>>(
    `select * from scheduled_tasks where id = $1 and user_id = $2 limit 1`,
    [id, userId],
  );

  if (!data) {
    throw createError.notFound('Schedule not found');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) });
}

// ---------------------------------------------------------------------------
// PUT /api/schedules/[id]
// ---------------------------------------------------------------------------

const VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'custom'];

async function handleUpdateSchedule(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PUT endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (typeof body['name'] === 'string' && body['name'].length > 500) {
    throw createError.validation('Name must be 500 characters or less');
  }
  if (typeof body['prompt'] === 'string' && body['prompt'].length > 10_000) {
    throw createError.validation('Prompt must be 10,000 characters or less');
  }

  // Build SET clauses dynamically from provided fields
  const setClauses: string[] = ['updated_at = now()'];
  const params: unknown[] = [];

  function addSet(col: string, val: unknown) {
    params.push(val);
    setClauses.push(`${col} = $${params.length}`);
  }

  if (typeof body['name'] === 'string') addSet('name', body['name'].trim());
  if (typeof body['prompt'] === 'string') addSet('prompt', body['prompt'].trim());
  if (typeof body['model'] === 'string' && body['model'].length <= 100)
    addSet('model', body['model']);
  if (typeof body['recurrence'] === 'string' && VALID_RECURRENCES.includes(body['recurrence']))
    addSet('recurrence', body['recurrence']);
  if (typeof body['cronExpression'] === 'string') addSet('cron_expression', body['cronExpression']);
  if (typeof body['scheduledAt'] === 'string') addSet('scheduled_at', body['scheduledAt']);
  if (body['scheduledAt'] === null) addSet('scheduled_at', null);
  if (Array.isArray(body['daysOfWeek'])) {
    const validDays = (body['daysOfWeek'] as unknown[]).filter(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    );
    addSet('days_of_week', validDays);
  }
  if (
    typeof body['dayOfMonth'] === 'number' &&
    Number.isInteger(body['dayOfMonth']) &&
    body['dayOfMonth'] >= 1 &&
    body['dayOfMonth'] <= 31
  ) {
    addSet('day_of_month', body['dayOfMonth']);
  }
  if (typeof body['timeOfDay'] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body['timeOfDay']))
    addSet('time_of_day', body['timeOfDay']);
  if (
    typeof body['timezone'] === 'string' &&
    body['timezone'].length <= 50 &&
    /^[\w/+-]+$/.test(body['timezone'])
  )
    addSet('timezone', body['timezone']);
  if (typeof body['isActive'] === 'boolean') addSet('is_active', body['isActive']);

  const idIdx = params.length + 1;
  const userIdx = params.length + 2;

  let data: Record<string, unknown>;
  try {
    const [updated] = await db.query<Record<string, unknown>>(
      `update scheduled_tasks set ${setClauses.join(', ')} where id = $${idIdx} and user_id = $${userIdx} returning *`,
      [...params, id, userId],
    );
    if (!updated) throw createError.notFound('Schedule not found');
    data = updated;
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      // Re-throw createError instances (e.g. notFound) directly
      throw error;
    }
    logger.error({ error, scheduleId: id }, 'Failed to update schedule');
    throw createError.notFound('Schedule not found');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) });
}

// ---------------------------------------------------------------------------
// DELETE /api/schedules/[id]
// ---------------------------------------------------------------------------

async function handleDeleteSchedule(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing DELETE endpoint
  const csrfError2 = await requireCsrfToken(request);
  if (csrfError2) return csrfError2 as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  try {
    await db.execute(`delete from scheduled_tasks where id = $1 and user_id = $2`, [id, userId]);
  } catch (error) {
    logger.error({ error, scheduleId: id }, 'Failed to delete schedule');
    throw createError.internal('Failed to delete schedule');
  }

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// PATCH /api/schedules/[id] (toggle active)
// ---------------------------------------------------------------------------

async function handleToggleSchedule(request: NextRequest, context: RouteContext) {
  // CSRF protection for state-changing PATCH endpoint
  const csrfError3 = await requireCsrfToken(request);
  if (csrfError3) return csrfError3 as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();
  const { id } = await context.params;

  let body: { isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (typeof body.isActive !== 'boolean') {
    throw createError.validation('isActive (boolean) is required');
  }

  const [data] = await db.query<Record<string, unknown>>(
    `update scheduled_tasks
     set is_active = $1, updated_at = now()
     where id = $2 and user_id = $3
     returning *`,
    [body.isActive, id, userId],
  );

  if (!data) {
    throw createError.notFound('Schedule not found');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) });
}

export const GET = withErrorHandler(handleGetSchedule);
export const PUT = withErrorHandler(handleUpdateSchedule);
export const DELETE = withErrorHandler(handleDeleteSchedule);
export const PATCH = withErrorHandler(handleToggleSchedule);

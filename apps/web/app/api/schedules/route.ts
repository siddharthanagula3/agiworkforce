/**
 * Schedules API
 *
 * GET /api/schedules - List all schedules for the authenticated user
 * POST /api/schedules - Create a new schedule
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

// ---------------------------------------------------------------------------
// GET /api/schedules
// ---------------------------------------------------------------------------

async function handleGetSchedules(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let data: Record<string, unknown>[];
  try {
    data = await db.query<Record<string, unknown>>(
      `select * from scheduled_tasks where user_id = $1 order by created_at desc limit 100`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch schedules');
    throw createError.internal('Failed to fetch schedules');
  }

  return NextResponse.json({
    schedules: data.map(mapRowToSchedule),
  });
}

// ---------------------------------------------------------------------------
// POST /api/schedules
// ---------------------------------------------------------------------------

const VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'custom'];

async function handleCreateSchedule(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  // Validate required fields
  if (!body['name'] || typeof body['name'] !== 'string' || body['name'].trim().length === 0) {
    throw createError.validation('Name is required');
  }
  if (!body['prompt'] || typeof body['prompt'] !== 'string' || body['prompt'].trim().length === 0) {
    throw createError.validation('Prompt is required');
  }
  if (typeof body['name'] === 'string' && body['name'].length > 500) {
    throw createError.validation('Name must be 500 characters or less');
  }
  if (typeof body['prompt'] === 'string' && body['prompt'].length > 10_000) {
    throw createError.validation('Prompt must be 10,000 characters or less');
  }

  const recurrence =
    typeof body['recurrence'] === 'string' && VALID_RECURRENCES.includes(body['recurrence'])
      ? body['recurrence']
      : 'once';

  // Validate model length
  const model =
    typeof body['model'] === 'string' && body['model'].length <= 100
      ? body['model']
      : 'auto-balanced';

  // Validate timeOfDay format (HH:MM, valid 00:00-23:59)
  const timeOfDay =
    typeof body['timeOfDay'] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body['timeOfDay'])
      ? body['timeOfDay']
      : '09:00';

  // Validate timezone format (basic IANA check)
  const timezone =
    typeof body['timezone'] === 'string' &&
    body['timezone'].length <= 50 &&
    /^[\w/+-]+$/.test(body['timezone'])
      ? body['timezone']
      : 'UTC';

  // Build parameterized insert dynamically to handle optional columns
  const columns = [
    'user_id',
    'name',
    'prompt',
    'model',
    'recurrence',
    'time_of_day',
    'timezone',
    'is_active',
  ];
  const values: unknown[] = [
    userId,
    (body['name'] as string).trim(),
    (body['prompt'] as string).trim(),
    model,
    recurrence,
    timeOfDay,
    timezone,
    body['isActive'] !== false,
  ];

  if (body['cronExpression'] && typeof body['cronExpression'] === 'string') {
    columns.push('cron_expression');
    values.push(body['cronExpression']);
  }
  if (body['scheduledAt'] && typeof body['scheduledAt'] === 'string') {
    columns.push('scheduled_at');
    values.push(body['scheduledAt']);
  }
  if (Array.isArray(body['daysOfWeek'])) {
    const validDays = (body['daysOfWeek'] as unknown[]).filter(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    );
    if (validDays.length > 0) {
      columns.push('days_of_week');
      values.push(validDays);
    }
  }
  if (
    typeof body['dayOfMonth'] === 'number' &&
    Number.isInteger(body['dayOfMonth']) &&
    body['dayOfMonth'] >= 1 &&
    body['dayOfMonth'] <= 31
  ) {
    columns.push('day_of_month');
    values.push(body['dayOfMonth']);
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `insert into scheduled_tasks (${columns.join(', ')}) values (${placeholders}) returning *`;

  let data: Record<string, unknown>;
  try {
    const [inserted] = await db.query<Record<string, unknown>>(sql, values);
    if (!inserted) throw new Error('No row returned');
    data = inserted;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create schedule');
    throw createError.internal('Failed to create schedule');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) }, { status: 201 });
}

export const GET = withErrorHandler(handleGetSchedules);
export const POST = withErrorHandler(handleCreateSchedule);

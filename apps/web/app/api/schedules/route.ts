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
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';

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

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch schedules');
    throw createError.internal('Failed to fetch schedules');
  }

  return NextResponse.json({
    schedules: (data || []).map(mapRowToSchedule),
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

  // RLS-AUDIT-FIX: replaced service-role client with user-scoped client.
  const { user, userDb: supabase } = await getAuthenticatedUserWithClient(request);

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

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    name: (body['name'] as string).trim(),
    prompt: (body['prompt'] as string).trim(),
    model,
    recurrence,
    time_of_day: timeOfDay,
    timezone,
    is_active: body['isActive'] !== false,
  };

  // Conditional fields
  if (body['cronExpression'] && typeof body['cronExpression'] === 'string') {
    insertData['cron_expression'] = body['cronExpression'];
  }
  if (body['scheduledAt'] && typeof body['scheduledAt'] === 'string') {
    insertData['scheduled_at'] = body['scheduledAt'];
  }
  if (Array.isArray(body['daysOfWeek'])) {
    // Validate each element is an integer 0-6
    const validDays = (body['daysOfWeek'] as unknown[]).filter(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    );
    if (validDays.length > 0) {
      insertData['days_of_week'] = validDays;
    }
  }
  if (
    typeof body['dayOfMonth'] === 'number' &&
    Number.isInteger(body['dayOfMonth']) &&
    body['dayOfMonth'] >= 1 &&
    body['dayOfMonth'] <= 31
  ) {
    insertData['day_of_month'] = body['dayOfMonth'];
  }

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to create schedule');
    throw createError.internal('Failed to create schedule');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) }, { status: 201 });
}

export const GET = withErrorHandler(handleGetSchedules);
export const POST = withErrorHandler(handleCreateSchedule);

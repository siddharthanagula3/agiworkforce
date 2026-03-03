/**
 * Single Schedule API
 *
 * GET /api/schedules/[id] - Get a single schedule
 * PUT /api/schedules/[id] - Update a schedule
 * DELETE /api/schedules/[id] - Delete a schedule
 * PATCH /api/schedules/[id] - Toggle active status
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, flowType: 'pkce' },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
    return data.user;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // ignore
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ignore
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

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

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    throw createError.notFound('Schedule not found');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) });
}

// ---------------------------------------------------------------------------
// PUT /api/schedules/[id]
// ---------------------------------------------------------------------------

const VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'custom'];

async function handleUpdateSchedule(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
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

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Build update object from provided fields
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body['name'] === 'string') updates['name'] = body['name'].trim();
  if (typeof body['prompt'] === 'string') updates['prompt'] = body['prompt'].trim();
  if (typeof body['model'] === 'string' && body['model'].length <= 100)
    updates['model'] = body['model'];
  if (typeof body['recurrence'] === 'string' && VALID_RECURRENCES.includes(body['recurrence'])) {
    updates['recurrence'] = body['recurrence'];
  }
  if (typeof body['cronExpression'] === 'string')
    updates['cron_expression'] = body['cronExpression'];
  if (typeof body['scheduledAt'] === 'string') updates['scheduled_at'] = body['scheduledAt'];
  if (body['scheduledAt'] === null) updates['scheduled_at'] = null;
  if (Array.isArray(body['daysOfWeek'])) {
    const validDays = (body['daysOfWeek'] as unknown[]).filter(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    );
    updates['days_of_week'] = validDays;
  }
  if (
    typeof body['dayOfMonth'] === 'number' &&
    Number.isInteger(body['dayOfMonth']) &&
    body['dayOfMonth'] >= 1 &&
    body['dayOfMonth'] <= 31
  ) {
    updates['day_of_month'] = body['dayOfMonth'];
  }
  if (typeof body['timeOfDay'] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body['timeOfDay']))
    updates['time_of_day'] = body['timeOfDay'];
  if (
    typeof body['timezone'] === 'string' &&
    body['timezone'].length <= 50 &&
    /^[\w/+-]+$/.test(body['timezone'])
  )
    updates['timezone'] = body['timezone'];
  if (typeof body['isActive'] === 'boolean') updates['is_active'] = body['isActive'];

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) {
    if (error) {
      logger.error({ error, scheduleId: id }, 'Failed to update schedule');
    }
    throw createError.notFound('Schedule not found');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) });
}

// ---------------------------------------------------------------------------
// DELETE /api/schedules/[id]
// ---------------------------------------------------------------------------

async function handleDeleteSchedule(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('scheduled_tasks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    logger.error({ error, scheduleId: id }, 'Failed to delete schedule');
    throw createError.internal('Failed to delete schedule');
  }

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// PATCH /api/schedules/[id] (toggle active)
// ---------------------------------------------------------------------------

async function handleToggleSchedule(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
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

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('scheduled_tasks')
    .update({
      is_active: body.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) {
    throw createError.notFound('Schedule not found');
  }

  return NextResponse.json({ schedule: mapRowToSchedule(data) });
}

export const GET = withErrorHandler(handleGetSchedule);
export const PUT = withErrorHandler(handleUpdateSchedule);
export const DELETE = withErrorHandler(handleDeleteSchedule);
export const PATCH = withErrorHandler(handleToggleSchedule);

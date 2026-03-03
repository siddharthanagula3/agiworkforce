/**
 * Schedule Runs API
 *
 * GET /api/schedules/[id]/runs - List runs for a schedule
 * POST /api/schedules/[id]/runs - Trigger an immediate run
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

  const user = await getAuthenticatedUser(request);
  const { id: scheduleId } = await context.params;

  const url = new URL(request.url);
  const parsedLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const limit = Math.min(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 100);

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the schedule belongs to this user
  const { data: schedule, error: scheduleError } = await supabase
    .from('scheduled_tasks')
    .select('id')
    .eq('id', scheduleId)
    .eq('user_id', user.id)
    .single();

  if (scheduleError || !schedule) {
    throw createError.notFound('Schedule not found');
  }

  // Fetch runs
  const { data, error } = await supabase
    .from('schedule_runs')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error({ error, scheduleId }, 'Failed to fetch schedule runs');
    throw createError.internal('Failed to fetch schedule runs');
  }

  return NextResponse.json({
    runs: (data || []).map(mapRowToRun),
  });
}

// ---------------------------------------------------------------------------
// POST /api/schedules/[id]/runs (trigger immediate run)
// ---------------------------------------------------------------------------

async function handleTriggerRun(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const { id: scheduleId } = await context.params;

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the schedule belongs to this user
  const { data: schedule, error: scheduleError } = await supabase
    .from('scheduled_tasks')
    .select('id')
    .eq('id', scheduleId)
    .eq('user_id', user.id)
    .single();

  if (scheduleError || !schedule) {
    throw createError.notFound('Schedule not found');
  }

  // Create a pending run
  const { data, error } = await supabase
    .from('schedule_runs')
    .insert({
      schedule_id: scheduleId,
      user_id: user.id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    logger.error({ error, scheduleId }, 'Failed to trigger schedule run');
    throw createError.internal('Failed to trigger schedule run');
  }

  // Update the schedule's last_run_at
  await supabase
    .from('scheduled_tasks')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: 'pending',
    })
    .eq('id', scheduleId)
    .eq('user_id', user.id);

  return NextResponse.json({ run: mapRowToRun(data) }, { status: 201 });
}

export const GET = withErrorHandler(handleGetRuns);
export const POST = withErrorHandler(handleTriggerRun);

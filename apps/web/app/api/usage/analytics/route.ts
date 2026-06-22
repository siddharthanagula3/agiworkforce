import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest } from '@/lib/cors';

const TimeRangeSchema = z.enum(['7d', '30d', '90d', 'all']).default('30d');

interface DailyUsageRow {
  date: string;
  total_tokens: string;
  total_cost_cents: string;
  session_count: string;
}

interface StatsRow {
  total_tokens: string;
  total_cost_cents: string;
  session_count: string;
  today_tokens: string;
  today_cost_cents: string;
  week_tokens: string;
  week_cost_cents: string;
  month_tokens: string;
  month_cost_cents: string;
}

function rangeToDays(range: string): number | null {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return null; // all time
}

function isMissingLedgerTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === '42P01' ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('credit_transactions'))
  );
}

/**
 * GET /api/usage/analytics?timeRange=30d
 * Return session analytics and daily usage trends for the current user.
 */
async function handleGetAnalytics(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'usage-analytics');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  const { searchParams } = new URL(request.url);
  const parsed = TimeRangeSchema.safeParse(searchParams.get('timeRange') ?? '30d');
  if (!parsed.success) {
    throw createError.validation('Invalid timeRange parameter');
  }
  const timeRange = parsed.data;
  const days = rangeToDays(timeRange);

  const db = getNeonDb();

  try {
    // Build date filter clause depending on range.
    const dateFilter = days !== null ? `and created_at >= now() - interval '${days} days'` : '';

    const dailyRows = await db.query<DailyUsageRow>(
      `select
         date_trunc('day', created_at)::date::text as date,
         coalesce(sum((metadata->>'tokens')::bigint), 0)::text as total_tokens,
         sum(abs(amount_cents))::text as total_cost_cents,
         count(distinct coalesce(metadata->>'session_id', id::text))::text as session_count
       from public.credit_transactions
       where user_id = $1
         and transaction_type = 'deduction'
         ${dateFilter}
       group by date_trunc('day', created_at)::date
       order by date_trunc('day', created_at)::date asc`,
      [userId],
    );

    const [stats] = await db.query<StatsRow>(
      `select
         coalesce(sum(case ${dateFilter !== '' ? `when created_at >= now() - interval '${days} days'` : 'when true'} then (metadata->>'tokens')::bigint else 0 end), 0)::text as total_tokens,
         coalesce(sum(case ${dateFilter !== '' ? `when created_at >= now() - interval '${days} days'` : 'when true'} then abs(amount_cents) else 0 end), 0)::text as total_cost_cents,
         count(distinct case ${dateFilter !== '' ? `when created_at >= now() - interval '${days} days'` : 'when true'} then coalesce(metadata->>'session_id', id::text) else null end)::text as session_count,
         coalesce(sum(case when created_at >= now() - interval '1 day' then (metadata->>'tokens')::bigint else 0 end), 0)::text as today_tokens,
         coalesce(sum(case when created_at >= now() - interval '1 day' then abs(amount_cents) else 0 end), 0)::text as today_cost_cents,
         coalesce(sum(case when created_at >= now() - interval '7 days' then (metadata->>'tokens')::bigint else 0 end), 0)::text as week_tokens,
         coalesce(sum(case when created_at >= now() - interval '7 days' then abs(amount_cents) else 0 end), 0)::text as week_cost_cents,
         coalesce(sum(case when created_at >= now() - interval '30 days' then (metadata->>'tokens')::bigint else 0 end), 0)::text as month_tokens,
         coalesce(sum(case when created_at >= now() - interval '30 days' then abs(amount_cents) else 0 end), 0)::text as month_cost_cents
       from public.credit_transactions
       where user_id = $1
         and transaction_type = 'deduction'`,
      [userId],
    );

    const totalTokens = parseInt(stats?.total_tokens ?? '0', 10);
    const sessionCount = parseInt(stats?.session_count ?? '0', 10);

    return NextResponse.json({
      daily_usage: dailyRows.map((r) => ({
        date: r.date,
        tokens: parseInt(r.total_tokens, 10),
        cost: parseInt(r.total_cost_cents, 10),
        sessions: parseInt(r.session_count, 10),
      })),
      stats: {
        total_tokens: totalTokens,
        total_cost: parseInt(stats?.total_cost_cents ?? '0', 10),
        avg_tokens_per_session: sessionCount > 0 ? Math.round(totalTokens / sessionCount) : 0,
        sessions_count: sessionCount,
        today_tokens: parseInt(stats?.today_tokens ?? '0', 10),
        today_cost: parseInt(stats?.today_cost_cents ?? '0', 10),
        week_tokens: parseInt(stats?.week_tokens ?? '0', 10),
        week_cost: parseInt(stats?.week_cost_cents ?? '0', 10),
        month_tokens: parseInt(stats?.month_tokens ?? '0', 10),
        month_cost: parseInt(stats?.month_cost_cents ?? '0', 10),
      },
      time_range: timeRange,
    });
  } catch (error) {
    if (isMissingLedgerTable(error)) {
      logger.warn({ userId }, 'credit_transactions table unavailable; returning empty analytics');
      return NextResponse.json({
        daily_usage: [],
        stats: {
          total_tokens: 0,
          total_cost: 0,
          avg_tokens_per_session: 0,
          sessions_count: 0,
          today_tokens: 0,
          today_cost: 0,
          week_tokens: 0,
          week_cost: 0,
          month_tokens: 0,
          month_cost: 0,
        },
        time_range: timeRange,
      });
    }
    logger.error({ error, userId }, 'Failed to fetch usage analytics');
    throw createError.internal('Failed to fetch usage analytics');
  }
}

export const GET = withErrorHandler(handleGetAnalytics);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

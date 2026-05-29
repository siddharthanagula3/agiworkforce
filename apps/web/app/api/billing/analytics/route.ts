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

interface TrendRow {
  date: string;
  total_tokens: string;
  total_cost_cents: string;
  session_count: string;
}

interface ProviderBreakdownRow {
  provider: string;
  total_tokens: string;
  total_cost_cents: string;
  session_count: string;
}

interface OverviewRow {
  total_spent_cents: string;
  total_tokens: string;
  days_in_range: string;
  session_count: string;
}

interface PeriodRow {
  tokens: string;
  cost_cents: string;
  sessions: string;
}

function rangeToDays(range: string): number | null {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return null;
}

/**
 * GET /api/billing/analytics?timeRange=30d
 * Enhanced billing analytics dashboard data.
 */
async function handleGetBillingAnalytics(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-analytics');
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
  const intervalClause = days !== null ? `interval '${days} days'` : null;
  const currentFilter = intervalClause ? `and created_at >= now() - ${intervalClause}` : '';
  const prevFilter = intervalClause
    ? `and created_at >= now() - ${intervalClause} * 2 and created_at < now() - ${intervalClause}`
    : '';

  const db = getNeonDb();

  try {
    const [trends, providers, overview, currentPeriod, previousPeriod] = await Promise.all([
      db.query<TrendRow>(
        `select
           date_trunc('day', created_at)::date::text as date,
           coalesce(sum((metadata->>'tokens')::bigint), 0)::text as total_tokens,
           sum(abs(amount_cents))::text as total_cost_cents,
           count(distinct metadata->>'session_id')::text as session_count
         from public.credit_transactions
         where user_id = $1
           and transaction_type = 'deduction'
           ${currentFilter}
         group by date_trunc('day', created_at)::date
         order by date_trunc('day', created_at)::date asc`,
        [userId],
      ),

      db.query<ProviderBreakdownRow>(
        `select
           coalesce(metadata->>'provider', 'unknown') as provider,
           coalesce(sum((metadata->>'tokens')::bigint), 0)::text as total_tokens,
           sum(abs(amount_cents))::text as total_cost_cents,
           count(distinct metadata->>'session_id')::text as session_count
         from public.credit_transactions
         where user_id = $1
           and transaction_type = 'deduction'
           ${currentFilter}
         group by metadata->>'provider'
         order by sum(abs(amount_cents)) desc`,
        [userId],
      ),

      db.query<OverviewRow>(
        `select
           sum(abs(amount_cents))::text as total_spent_cents,
           coalesce(sum((metadata->>'tokens')::bigint), 0)::text as total_tokens,
           greatest(extract(epoch from (max(created_at) - min(created_at))) / 86400, 1)::text as days_in_range,
           count(distinct metadata->>'session_id')::text as session_count
         from public.credit_transactions
         where user_id = $1
           and transaction_type = 'deduction'
           ${currentFilter}`,
        [userId],
      ),

      db.query<PeriodRow>(
        `select
           coalesce(sum((metadata->>'tokens')::bigint), 0)::text as tokens,
           sum(abs(amount_cents))::text as cost_cents,
           count(distinct metadata->>'session_id')::text as sessions
         from public.credit_transactions
         where user_id = $1
           and transaction_type = 'deduction'
           ${currentFilter}`,
        [userId],
      ),

      db.query<PeriodRow>(
        `select
           coalesce(sum((metadata->>'tokens')::bigint), 0)::text as tokens,
           sum(abs(amount_cents))::text as cost_cents,
           count(distinct metadata->>'session_id')::text as sessions
         from public.credit_transactions
         where user_id = $1
           and transaction_type = 'deduction'
           ${prevFilter}`,
        [userId],
      ),
    ]);

    const totalSpent = parseInt(overview[0]?.total_spent_cents ?? '0', 10);
    const totalTokens = parseInt(overview[0]?.total_tokens ?? '0', 10);
    const daysInRange = parseFloat(overview[0]?.days_in_range ?? '1');

    const curTokens = parseInt(currentPeriod[0]?.tokens ?? '0', 10);
    const curCost = parseInt(currentPeriod[0]?.cost_cents ?? '0', 10);
    const curSessions = parseInt(currentPeriod[0]?.sessions ?? '0', 10);
    const prevTokens = parseInt(previousPeriod[0]?.tokens ?? '0', 10);
    const prevCost = parseInt(previousPeriod[0]?.cost_cents ?? '0', 10);
    const prevSessions = parseInt(previousPeriod[0]?.sessions ?? '0', 10);

    const pctChange = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100 * 10) / 10;

    const totalProviderCost = providers.reduce((s, p) => s + parseInt(p.total_cost_cents, 10), 0);

    return NextResponse.json({
      overview: {
        total_spent: totalSpent,
        total_tokens_used: totalTokens,
        avg_cost_per_day: daysInRange > 0 ? Math.round(totalSpent / daysInRange) : 0,
        avg_tokens_per_day: daysInRange > 0 ? Math.round(totalTokens / daysInRange) : 0,
        projected_monthly_spend: Math.round((totalSpent / daysInRange) * 30),
        savings_from_plan: 0,
      },
      trends: trends.map((t) => ({
        date: t.date,
        tokens: parseInt(t.total_tokens, 10),
        cost: parseInt(t.total_cost_cents, 10),
        sessions: parseInt(t.session_count, 10),
      })),
      provider_breakdown: providers.map((p) => {
        const pCost = parseInt(p.total_cost_cents, 10);
        return {
          provider: p.provider,
          tokens: parseInt(p.total_tokens, 10),
          cost: pCost,
          percentage:
            totalProviderCost > 0 ? Math.round((pCost / totalProviderCost) * 1000) / 10 : 0,
          sessions: parseInt(p.session_count, 10),
        };
      }),
      top_sessions: [],
      period_comparison: {
        current_period: { tokens: curTokens, cost: curCost, sessions: curSessions },
        previous_period: { tokens: prevTokens, cost: prevCost, sessions: prevSessions },
        percent_change: {
          tokens: pctChange(curTokens, prevTokens),
          cost: pctChange(curCost, prevCost),
          sessions: pctChange(curSessions, prevSessions),
        },
      },
      time_range: timeRange,
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch billing analytics');
    throw createError.internal('Failed to fetch billing analytics');
  }
}

export const GET = withErrorHandler(handleGetBillingAnalytics);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

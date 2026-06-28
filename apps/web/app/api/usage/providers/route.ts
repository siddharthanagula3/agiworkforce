import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest } from '@/lib/cors';

interface ProviderUsageRow {
  provider: string;
  total_tokens: string;
  total_cost_cents: string;
  request_count: string;
}

/**
 * GET /api/usage/providers
 * Return token and cost usage grouped by LLM provider for the current user.
 * Aggregates credit_transactions metadata where provider is recorded.
 */
async function handleGetProviderUsage(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'usage-providers');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  const db = getNeonDb();

  try {
    // Aggregate usage from credit_transactions where metadata includes provider info.
    // Only deduction transactions are relevant for per-provider usage.
    const rows = await db.query<ProviderUsageRow>(
      `select
         coalesce(metadata->>'provider', 'unknown') as provider,
         coalesce(sum((metadata->>'totalTokens')::bigint), 0)::text as total_tokens,
         sum(amount_cents)::text as total_cost_cents,
         count(*)::text as request_count
       from public.credit_transactions
       where user_id = $1
         and transaction_type = 'deduction'
         and metadata is not null
         and metadata->>'provider' is not null
       group by metadata->>'provider'
       order by sum(amount_cents) desc`,
      [userId],
    );

    const providers = rows.map((r) => ({
      provider: r.provider,
      tokens: parseInt(r.total_tokens, 10),
      cost: parseInt(r.total_cost_cents, 10),
      request_count: parseInt(r.request_count, 10),
    }));

    return NextResponse.json({ providers });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch provider usage');
    throw createError.internal('Failed to fetch provider usage');
  }
}

export const GET = withErrorHandler(handleGetProviderUsage);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

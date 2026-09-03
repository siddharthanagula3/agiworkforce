import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest } from '@/lib/cors';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

// User-facing transaction kinds only. `allocation` (period credit grant) and
// `reset` (daily flagship-cap reset) are internal bookkeeping events written
// by every renewal/reset tick for every subscriber — real, but not something
// a user did or was charged for, and they would drown the entries that ARE
// meaningful (a purchase, a refund, a manual adjustment, and every per-task
// deduction) in noise. See db/neon/0004_token_credits.sql:24-25 for the full
// constraint and db/neon/0020_functions.sql:283-469 for what writes each type.
// Fixed, compile-time constant — inlined into the SQL `in (...)` list below
// rather than bound as a parameter, since it never varies per request.
const USER_FACING_TRANSACTION_TYPES = ['purchase', 'adjustment', 'refund', 'bonus', 'deduction'];
const TRANSACTION_TYPE_IN_LIST = USER_FACING_TRANSACTION_TYPES.map((t) => `'${t}'`).join(', ');

interface CreditHistoryRow {
  id: string;
  transaction_type: string;
  amount_cents: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * GET /api/billing/credit-history
 * List the current user's real per-task credit ledger: purchases, refunds,
 * bonuses, manual adjustments, and every usage deduction.
 * Returns an empty list if the account has no transactions yet — never
 * fabricated rows.
 */
async function handleGetCreditHistory(request: NextRequest) {
  // Reuses the 'billing-invoices' bucket (30/min, fail-open) rather than
  // adding a new RateLimitKey entry to lib/rate-limit.ts: this is a read-only
  // GET of comparable sensitivity/cost to that route, and RateLimitKey is a
  // literal union sourced from that shared config file, which is outside this
  // route's ownership. The two routes sharing a per-user bucket only matters
  // if a caller hits both endpoints >30 times/min combined — far above normal
  // settings-page usage. Give this route its own key if that ever changes.
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  let db: Awaited<ReturnType<typeof getUserScopedDb>>['db'];
  let userId: string;
  try {
    ({ db, userId } = await getUserScopedDb(request));
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  const url = new URL(request.url);
  const limit =
    parsePositiveInt(url.searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT) || DEFAULT_LIMIT;
  const offset = parsePositiveInt(url.searchParams.get('offset'), 0);

  try {
    const rows = await db.query<CreditHistoryRow>(
      `select id, transaction_type, amount_cents, description, metadata, created_at::text as created_at
       from public.credit_transactions
       where user_id = $1
         and transaction_type in (${TRANSACTION_TYPE_IN_LIST})
       order by created_at desc
       limit $2 offset $3`,
      [userId, limit, offset],
    );
    return NextResponse.json({ transactions: rows, has_more: rows.length === limit });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch credit history');
    throw createError.internal('Failed to fetch credit history');
  }
}

export const GET = withErrorHandler(handleGetCreditHistory);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

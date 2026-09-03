import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { handleCorsPreflightRequest } from '@/lib/cors';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

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

async function handleGetCreditHistory(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  let db: Awaited<ReturnType<typeof getUserScopedDb>>['db'];
  let userId: string;
  try {
    ({ db, userId } = await getUserScopedDb(request));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
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

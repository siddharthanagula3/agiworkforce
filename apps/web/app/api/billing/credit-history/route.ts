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
import { creditsFromCents, getModelMetadataById } from '@agiworkforce/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parsePositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

// User-facing transaction kinds only. `allocation` (period credit grant) and
// `reset` (daily flagship-cap reset) are internal bookkeeping events written
// by every renewal/reset tick for every subscriber, real, but not something
// a user did or was charged for, and they would drown the entries that ARE
// meaningful (a purchase, a refund, a manual adjustment, and every per-task
// deduction) in noise. See db/neon/0004_token_credits.sql:24-25 for the full
// constraint and db/neon/0020_functions.sql:283-469 for what writes each type.
// Fixed, compile-time constant, inlined into the SQL `in (...)` list below
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

const RESERVATION_DESCRIPTION_PREFIX = 'Managed usage reservation: ';
const RECONCILIATION_DESCRIPTION = 'Managed usage actual-cost reconciliation';
const USAGE_LABEL_PREFIX = 'Usage: ';
const USAGE_ADJUSTMENT_LABEL = 'Usage adjustment';
const ROUTE_ID_SEPARATOR = '/';

/**
 * The ledger names a debit by the route it reserved against, which is the
 * company's routing detail. A user sees the model they used and its official
 * price in credits, never which host served it or what that host charged.
 */
function labelForRow(row: CreditHistoryRow): string | null {
  const description = row.description;
  if (!description) return null;
  if (description === RECONCILIATION_DESCRIPTION) return USAGE_ADJUSTMENT_LABEL;
  if (!description.startsWith(RESERVATION_DESCRIPTION_PREFIX)) return null;
  const routeId = description.slice(RESERVATION_DESCRIPTION_PREFIX.length);
  const separatorIndex = routeId.indexOf(ROUTE_ID_SEPARATOR);
  const modelId = separatorIndex >= 0 ? routeId.slice(separatorIndex + 1) : routeId;
  return `${USAGE_LABEL_PREFIX}${getModelMetadataById(modelId)?.name ?? modelId}`;
}

function readMetadataString(row: CreditHistoryRow, key: string): string | null {
  const value = row.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * What the row was spent on, as the user would name it. `reservedModel` is the
 * model they picked; `servedModel` and `servedProvider` are the company's
 * routing detail and never surface here.
 */
function modelLabelForRow(row: CreditHistoryRow): string | null {
  const reserved = readMetadataString(row, 'reservedModel');
  if (!reserved) return null;
  return getModelMetadataById(reserved)?.name ?? reserved;
}

/**
 * GET /api/billing/credit-history
 * List the current user's real per-task credit ledger: purchases, refunds,
 * bonuses, manual adjustments, and every usage deduction.
 * Returns an empty list if the account has no transactions yet, never
 * fabricated rows.
 */
async function handleGetCreditHistory(request: NextRequest) {
  // Reuses the 'billing-invoices' bucket (30/min, fail-open) rather than
  // adding a new RateLimitKey entry to lib/rate-limit.ts: this is a read-only
  // GET of comparable sensitivity/cost to that route, and RateLimitKey is a
  // literal union sourced from that shared config file, which is outside this
  // route's ownership. The two routes sharing a per-user bucket only matters
  // if a caller hits both endpoints >30 times/min combined, far above normal
  // settings-page usage. Give this route its own key if that ever changes.
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
    // A projection, never a spread of the row. `metadata` is the settlement
    // blob: it carries the served provider, the served route and the operands
    // the company was charged, none of which is the user's ledger.
    const transactions = rows.map((row) => ({
      id: row.id,
      transaction_type: row.transaction_type,
      amount_cents: row.amount_cents,
      description: row.description,
      created_at: row.created_at,
      label: labelForRow(row),
      credits: creditsFromCents(row.amount_cents),
      feature: readMetadataString(row, 'quotaFeature'),
      model: modelLabelForRow(row),
    }));
    return NextResponse.json({ transactions, has_more: rows.length === limit });
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

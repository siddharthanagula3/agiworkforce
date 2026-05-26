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

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  provider: z.string().optional(),
  start_date: z.string().datetime({ offset: true }).optional(),
  end_date: z.string().datetime({ offset: true }).optional(),
});

interface UsageHistoryRow {
  id: string;
  user_id: string;
  credit_account_id: string;
  transaction_type: string;
  amount_cents: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * GET /api/usage/history
 * Paginated token usage history for the current user.
 * Deduction transactions map to individual LLM call records.
 */
async function handleGetHistory(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'usage-history');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
    provider: searchParams.get('provider') ?? undefined,
    start_date: searchParams.get('start_date') ?? undefined,
    end_date: searchParams.get('end_date') ?? undefined,
  });

  if (!parsed.success) {
    throw createError.validation('Invalid query parameters', parsed.error.issues);
  }

  const { limit, offset, provider, start_date, end_date } = parsed.data;

  const db = getNeonDb();

  try {
    const params: unknown[] = [userId, limit, offset];
    const clauses: string[] = [];

    if (provider) {
      params.push(provider);
      clauses.push(`metadata->>'provider' = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      clauses.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (end_date) {
      params.push(end_date);
      clauses.push(`created_at <= $${params.length}::timestamptz`);
    }

    const whereExtra = clauses.length > 0 ? `and ${clauses.join(' and ')}` : '';

    const rows = await db.query<UsageHistoryRow>(
      `select id, user_id, credit_account_id, transaction_type, amount_cents, metadata, created_at
       from public.credit_transactions
       where user_id = $1
         and transaction_type = 'deduction'
         ${whereExtra}
       order by created_at desc
       limit $2
       offset $3`,
      params,
    );

    const records = rows.map((r) => {
      const meta = r.metadata ?? {};
      return {
        id: r.id,
        user_id: r.user_id,
        session_id: (meta['session_id'] as string | undefined) ?? null,
        provider: (meta['provider'] as string | undefined) ?? 'unknown',
        model: (meta['model'] as string | undefined) ?? 'unknown',
        input_tokens: Number((meta['input_tokens'] as number | undefined) ?? 0),
        output_tokens: Number((meta['output_tokens'] as number | undefined) ?? 0),
        total_tokens: Number((meta['tokens'] as number | undefined) ?? 0),
        cost: parseInt(r.amount_cents, 10),
        created_at: r.created_at,
        metadata: {
          session_title: (meta['session_title'] as string | undefined) ?? undefined,
          message_id: (meta['message_id'] as string | undefined) ?? undefined,
          employee_id: (meta['employee_id'] as string | undefined) ?? undefined,
        },
      };
    });

    return NextResponse.json({ records, limit, offset });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch usage history');
    throw createError.internal('Failed to fetch usage history');
  }
}

export const GET = withErrorHandler(handleGetHistory);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

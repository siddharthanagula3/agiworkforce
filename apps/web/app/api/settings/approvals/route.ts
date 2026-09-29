import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { buildPage, decodeKeysetCursor, keysetSql } from '@/lib/identity/pagination';

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

const PAGE_SORT_COLUMN = 'page_sort_key';
const PAGE_SORT_KEY_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const CursorSchema = z.object({
  sortValue: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  id: z.string().uuid(),
});

interface ApprovalRow {
  id: string;
  tool_name: string | null;
  decision: string | null;
  conversation_id: string | null;
  created_at: string;
  page_sort_key: string;
}

export interface ApprovalHistoryEntry {
  id: string;
  toolName: string;
  decision: 'approved' | 'rejected';
  conversationId: string | null;
  createdAt: string;
}

async function handleGetApprovals(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-activity');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  let db: ScopedDb;
  try {
    ({ db, userId } = await getUserScopedDb(request, { resolveOrganization: false }));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('Invalid query parameters', parsed.error.issues);
  }
  const { limit } = parsed.data;
  const cursorParam = searchParams.get('cursor');
  const cursor = cursorParam ? CursorSchema.safeParse(decodeKeysetCursor(cursorParam)) : null;
  if (cursor && !cursor.success) {
    throw createError.validation('Invalid query parameters', cursor.error.issues);
  }
  const keyset = keysetSql({
    sortColumn: PAGE_SORT_COLUMN,
    idColumn: 'id',
    ...(cursor ? { cursor: cursor.data } : {}),
    firstParamIndex: 3,
  });

  try {
    const rows = await db.query<ApprovalRow>(
      `select * from (
         select id,
                details->>'resourceName' as tool_name,
                details->>'status' as decision,
                details->>'conversationId' as conversation_id,
                created_at,
                to_char(created_at at time zone 'utc', ${PAGE_SORT_KEY_FORMAT}) as ${PAGE_SORT_COLUMN}
           from public.security_audit_logs
          where user_id = $1 and event_type = 'tool_approval_decided'
       ) approvals
       ${keyset.where ? `where ${keyset.where}` : ''}
       ${keyset.orderBy}
       limit $2`,
      [userId, limit + 1, ...keyset.params],
    );
    const page = buildPage(rows, limit, (row) => ({ sortValue: row.page_sort_key, id: row.id }));
    const approvals = page.items.flatMap((row): ApprovalHistoryEntry[] =>
      row.tool_name && (row.decision === 'approved' || row.decision === 'rejected')
        ? [
            {
              id: row.id,
              toolName: row.tool_name,
              decision: row.decision,
              conversationId: row.conversation_id,
              createdAt: row.created_at,
            },
          ]
        : [],
    );
    return NextResponse.json({
      approvals,
      limit,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch approval history');
    throw createError.internal('Failed to fetch approval history');
  }
}

export const GET = withErrorHandler(handleGetApprovals);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}

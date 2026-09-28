import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest } from '@/lib/cors';

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

interface ApprovalRow {
  id: string;
  tool_name: string | null;
  decision: string | null;
  conversation_id: string | null;
  created_at: string;
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
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('Invalid query parameters', parsed.error.issues);
  }
  const { limit, offset } = parsed.data;

  try {
    const rows = await db.query<ApprovalRow>(
      `select id,
              details->>'resourceName' as tool_name,
              details->>'status' as decision,
              details->>'conversationId' as conversation_id,
              created_at
         from public.security_audit_logs
        where user_id = $1 and event_type = 'tool_approval_decided'
        order by created_at desc
        limit $2
       offset $3`,
      [userId, limit, offset],
    );
    const approvals = rows.flatMap((row): ApprovalHistoryEntry[] =>
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
    return NextResponse.json({ approvals, limit, offset });
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

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { presentableAuditRowClause } from '../../activity/activity-presentation';

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

const AUDIT_SCOPE = { resolveOrganization: false } as const;

async function handleGetActions(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'settings-audit-actions');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  let db: ScopedDb;
  try {
    ({ db, userId } = await getUserScopedDb(request, AUDIT_SCOPE));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }

  try {
    const params: unknown[] = [userId];
    const presentable = presentableAuditRowClause(params);
    const rows = await db.query<{ event_type: string }>(
      `select distinct sal.event_type
       from public.security_audit_logs sal
       where sal.user_id = $1
         and ${presentable}
       order by sal.event_type asc
       limit 200`,
      params,
    );

    return NextResponse.json({ actions: rows.map((r) => r.event_type) });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to fetch audit log actions');
    throw createError.internal('Failed to fetch audit log actions');
  }
}

export const GET = withErrorHandler(handleGetActions);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
